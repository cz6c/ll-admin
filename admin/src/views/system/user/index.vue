<template>
  <div class="app-page">
    <el-row :gutter="20">
      <!--部门数据-->
      <el-col :span="4" :xs="24">
        <div class="head-container">
          <el-input
            v-model="deptName"
            placeholder="请输入部门名称"
            clearable
            prefix-icon="Search"
            style="margin-bottom: 20px"
          />
        </div>
        <div class="head-container">
          <el-tree
            ref="deptTreeRef"
            :data="deptOptions"
            :props="{ label: 'deptName', children: 'children' }"
            :expand-on-click-node="false"
            :filter-node-method="filterNode"
            node-key="deptId"
            highlight-current
            default-expand-all
            @node-click="handleNodeClick"
          />
        </div>
      </el-col>
      <!--用户数据-->
      <el-col :span="20" :xs="24">
        <el-form ref="queryRef" :model="queryParams" :inline="true" label-width="68px">
          <el-form-item label="用户名称" prop="userName">
            <el-input
              v-model="queryParams.userName"
              placeholder="请输入用户名称"
              clearable
              style="width: 240px"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item label="手机号码" prop="phonenumber">
            <el-input
              v-model="queryParams.phonenumber"
              placeholder="请输入手机号码"
              clearable
              style="width: 240px"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item label="状态" prop="status">
            <el-select v-model="queryParams.status" placeholder="用户状态" clearable style="width: 240px">
              <el-option v-for="dict in StatusEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
            </el-select>
          </el-form-item>
          <el-form-item label="创建时间" style="width: 308px">
            <el-date-picker
              v-model="dateRange"
              value-format="YYYY-MM-DD"
              type="daterange"
              range-separator="-"
              start-placeholder="开始日期"
              end-placeholder="结束日期"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery">搜索</el-button>
            <el-button icon="Refresh" @click="resetQuery">重置</el-button>
          </el-form-item>
        </el-form>

        <el-row :gutter="10" class="mb8">
          <el-col :span="1.5">
            <el-button v-auth="'add'" type="primary" plain icon="Plus" @click="handleAdd">新增</el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button v-auth="'remove'" type="danger" plain icon="Delete" :disabled="multiple" @click="handleDelete">
              删除
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button v-auth="'import'" type="info" plain icon="Upload" @click="handleImport">导入</el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button v-auth="'export'" type="warning" plain icon="Download" @click="handleExport">导出</el-button>
          </el-col>
        </el-row>

        <el-table v-loading="loading" :data="userList" @selection-change="handleSelectionChange">
          <el-table-column type="selection" width="50" align="center" />
          <el-table-column key="userId" label="用户编号" align="center" prop="userId" />
          <el-table-column
            key="userName"
            label="用户名称"
            align="center"
            prop="userName"
            :show-overflow-tooltip="true"
          />
          <el-table-column
            key="nickName"
            label="用户昵称"
            align="center"
            prop="nickName"
            :show-overflow-tooltip="true"
          />
          <el-table-column
            key="deptName"
            label="部门"
            align="center"
            prop="dept.deptName"
            :show-overflow-tooltip="true"
          />
          <el-table-column key="phonenumber" label="手机号码" align="center" prop="phonenumber" width="120" />
          <el-table-column key="status" label="状态" align="center">
            <template #default="scope">
              <el-switch
                v-model="scope.row.status"
                active-value="0"
                inactive-value="1"
                @change="handleStatusChange(scope.row)"
              />
            </template>
          </el-table-column>
          <el-table-column key="userType" label="用户类型" align="center" prop="userType" width="120">
            <template #default="scope">
              <span>{{ scope.row.userType === "00" ? "系统用户" : "" }}</span>
            </template>
          </el-table-column>
          <el-table-column label="创建时间" align="center" prop="createTime" width="160">
            <template #default="scope">
              <span>{{ parseTime(scope.row.createTime) }}</span>
            </template>
          </el-table-column>
          <el-table-column label="操作" align="center" width="150" class-name="small-padding fixed-width">
            <template #default="scope">
              <el-tooltip v-if="scope.row.userId !== 1" content="修改" placement="top">
                <el-button v-auth="'edit'" link type="primary" icon="Edit" @click="handleUpdate(scope.row)" />
              </el-tooltip>
              <el-tooltip v-if="scope.row.userId !== 1 && scope.row.userType !== '00'" content="删除" placement="top">
                <el-button v-auth="'remove'" link type="primary" icon="Delete" @click="handleDelete(scope.row)" />
              </el-tooltip>
              <el-tooltip v-if="scope.row.userId !== 1" content="重置密码" placement="top">
                <el-button v-auth="'resetPwd'" link type="primary" icon="Key" @click="handleResetPwd(scope.row)" />
              </el-tooltip>
              <el-tooltip v-if="scope.row.userId !== 1" content="分配角色" placement="top">
                <el-button v-auth="'edit'" link type="primary" icon="CircleCheck" @click="handleAuthRole(scope.row)" />
              </el-tooltip>
            </template>
          </el-table-column>
        </el-table>
        <pagination
          v-show="total > 0"
          v-model:page="queryParams.pageNum"
          v-model:limit="queryParams.pageSize"
          :total="total"
          @pagination="getList"
        />
      </el-col>
    </el-row>

    <!-- 添加或修改用户配置对话框 -->
    <el-dialog v-model="open" :title="title" width="600px" append-to-body>
      <el-form ref="userRef" :model="form" :rules="rules" label-width="80px">
        <el-row>
          <el-col :span="12">
            <el-form-item label="用户昵称" prop="nickName">
              <el-input v-model="form.nickName" placeholder="请输入用户昵称" maxlength="30" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="归属部门" prop="deptId">
              <el-tree-select
                v-model="form.deptId"
                :data="deptOptions"
                :props="{ label: 'deptName', children: 'children' }"
                value-key="deptId"
                placeholder="请选择归属部门"
                check-strictly
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="手机号码" prop="phonenumber">
              <el-input v-model="form.phonenumber" placeholder="请输入手机号码" maxlength="11" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="邮箱" prop="email">
              <el-input v-model="form.email" placeholder="请输入邮箱" maxlength="50" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item v-if="form.userId == undefined" label="用户名称" prop="userName">
              <el-input v-model="form.userName" placeholder="请输入用户名称" maxlength="30" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item v-if="form.userId == undefined" label="用户密码" prop="password">
              <el-input
                v-model="form.password"
                placeholder="请输入用户密码"
                type="password"
                maxlength="20"
                show-password
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="用户性别">
              <el-select v-model="form.sex" placeholder="请选择">
                <el-option v-for="dict in UserSexEnum" :key="dict.value" :label="dict.label" :value="dict.value" />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="状态">
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in StatusEnum" :key="dict.value" :label="dict.value">{{ dict.label }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item label="岗位">
              <el-select v-model="form.postIds" multiple placeholder="请选择">
                <el-option
                  v-for="item in postOptions"
                  :key="item.postId"
                  :label="item.postName"
                  :value="item.postId"
                  :disabled="item.status == 1"
                />
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="角色">
              <el-select v-model="form.roleIds" multiple placeholder="请选择">
                <el-option
                  v-for="item in roleOptions"
                  :key="item.roleId"
                  :label="item.roleName"
                  :value="item.roleId"
                  :disabled="item.status == 1"
                />
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-form-item label="备注">
              <el-input v-model="form.remark" type="textarea" placeholder="请输入内容" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="submitForm">确 定</el-button>
          <el-button @click="cancel">取 消</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 用户导入对话框 -->
    <el-dialog v-model="upload.open" :title="upload.title" width="400px" append-to-body>
      <ImportTemp
        v-if="upload.open"
        importUrl="/system/user/importData"
        importTempUrl="system/user/importTemplate"
        filePrefix="user_"
        @success="getList"
        @close="upload.open = false"
      />
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { changeUserStatus, listUser, resetUserPwd, delUser, getUser, updateUser, addUser } from "@/api/system/user";
import { listRole } from "@/api/system/role";
import { listPost } from "@/api/system/post";
import { listDept } from "@/api/system/dept";
import { listToTree } from "@/utils/tree";
import { parseTime, addDateRange } from "@/utils";
import { useDict } from "@/hooks/useDict";
import { FormInstance, FormRules, TreeInstance } from "element-plus";
import ImportTemp from "@/components/ImportTemp/index.vue";

defineOptions({
  name: "User"
});
const router = useRouter();
const { proxy } = getCurrentInstance();

const { UserSexEnum, StatusEnum } = toRefs(useDict("UserSexEnum", "StatusEnum"));

const userList = ref([]);
const open = ref(false);
const loading = ref(true);
const ids = ref([]);
const multiple = ref(true);
const total = ref(0);
const title = ref("");
const dateRange = ref([]);
const deptName = ref("");
const deptOptions = ref(undefined);
const initPassword = ref(undefined);
const postOptions = ref([]);
const roleOptions = ref([]);
/*** 用户导入参数 */
const upload = reactive({
  // 是否显示弹出层（用户导入）
  open: false,
  // 弹出层标题（用户导入）
  title: ""
});

const deptTreeRef = ref<TreeInstance>(null);
const queryRef = ref<FormInstance>(null);
const userRef = ref<FormInstance>(null);

const data = reactive({
  form: {
    userId: undefined,
    deptId: undefined,
    userName: "",
    nickName: "",
    password: "",
    phonenumber: "",
    email: "",
    sex: "",
    status: "0",
    remark: "",
    postIds: [],
    roleIds: []
  },
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    userName: undefined,
    phonenumber: undefined,
    status: undefined,
    deptId: undefined
  },
  rules: {
    userName: [
      { required: true, message: "用户名称不能为空", trigger: "blur" },
      {
        min: 2,
        max: 20,
        message: "用户名称长度必须介于 2 和 20 之间",
        trigger: "blur"
      }
    ],
    nickName: [{ required: true, message: "用户昵称不能为空", trigger: "blur" }],
    password: [
      { required: true, message: "用户密码不能为空", trigger: "blur" },
      {
        min: 5,
        max: 20,
        message: "用户密码长度必须介于 5 和 20 之间",
        trigger: "blur"
      }
    ],
    email: [
      {
        type: "email",
        message: "请输入正确的邮箱地址",
        trigger: ["blur", "change"]
      }
    ],
    phonenumber: [
      {
        pattern: /^1[3|4|5|6|7|8|9][0-9]\d{8}$/,
        message: "请输入正确的手机号码",
        trigger: "blur"
      }
    ]
  } as FormRules
});

const { queryParams, form, rules } = toRefs(data);

/** 通过条件过滤节点  */
const filterNode = (value: string, data) => {
  if (!value) return true;
  let labelKey = unref(deptTreeRef).store.props.label as string;
  return data[labelKey].indexOf(value) !== -1;
};
/** 根据名称筛选部门树 */
watch(deptName, val => {
  unref(deptTreeRef).filter(val);
});
/** 查询部门下拉树结构 */
function getDeptTree() {
  listDept().then(response => {
    deptOptions.value = listToTree(response.data, { id: "deptId" });
  });
}
/** 节点单击事件 */
function handleNodeClick(data) {
  let key = unref(deptTreeRef).store.key;
  queryParams.value.deptId = data[key];
  handleQuery();
}

/** 查询用户列表 */
function getList() {
  loading.value = true;
  listUser(addDateRange(queryParams.value, dateRange.value)).then(res => {
    loading.value = false;
    userList.value = res.data.list;
    total.value = res.data.total;
  });
}
/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1;
  getList();
}
/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = [];
  resetForm(queryRef.value);
  queryParams.value.deptId = undefined;
  unref(deptTreeRef).setCurrentKey(null);
  handleQuery();
}
/** 选择条数  */
function handleSelectionChange(selection) {
  ids.value = selection.filter(({ userType }) => userType !== "00").map(item => item.userId);
  multiple.value = !ids.value.length;
}
/** 删除按钮操作 */
function handleDelete(row) {
  const userIds = row.userId || ids.value.join(",");
  proxy.$modal
    .confirm('是否确认删除用户编号为"' + userIds + '"的数据项？')
    .then(function () {
      return delUser(userIds);
    })
    .then(() => {
      getList();
      proxy.$message.success("删除成功");
    })
    .catch(() => {});
}
/** 导出按钮操作 */
function handleExport() {
  proxy.$file.download(
    "system/user/export",
    {
      ...queryParams.value
    },
    `user_${new Date().getTime()}.xlsx`
  );
}
/** 导入按钮操作 */
function handleImport() {
  upload.title = "用户导入";
  upload.open = true;
}

/** 用户状态修改  */
function handleStatusChange(row) {
  let text = row.status === "0" ? "启用" : "停用";
  proxy.$modal
    .confirm('确认要"' + text + '""' + row.userName + '"用户吗?')
    .then(function () {
      return changeUserStatus({ userId: row.userId, status: row.status });
    })
    .then(() => {
      proxy.$message.success(text + "成功");
    })
    .catch(function () {
      row.status = row.status === "0" ? "1" : "0";
    });
}
/** 跳转角色分配 */
function handleAuthRole(row) {
  const userId = row.userId;
  router.push("/system/user/authRole?userId=" + userId);
}
/** 重置密码按钮操作 */
function handleResetPwd(row) {
  ElMessageBox.prompt('请输入"' + row.userName + '"的新密码', "提示", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    closeOnClickModal: false,
    inputPattern: /^.{5,20}$/,
    inputErrorMessage: "用户密码长度必须介于 5 和 20 之间"
  })
    .then(({ value }) => {
      resetUserPwd({ userId: row.userId, password: value }).then(response => {
        proxy.$message.success("修改成功，新密码是：" + value);
      });
    })
    .catch(() => {});
}

/** 重置操作表单 */
function reset() {
  form.value = {
    userId: undefined,
    deptId: undefined,
    userName: "",
    nickName: "",
    password: "",
    phonenumber: "",
    email: "",
    sex: "",
    status: "0",
    remark: "",
    postIds: [],
    roleIds: []
  };
  resetForm(userRef.value);
}
function resetForm(formEl: FormInstance | undefined) {
  formEl && formEl.resetFields();
}
function getPostAndRoleAllFn() {
  listRole({}).then(response => {
    roleOptions.value = response.data.list;
  });
  listPost({}).then(response => {
    postOptions.value = response.data.list;
  });
}
/** 取消按钮 */
function cancel() {
  open.value = false;
  reset();
}
/** 新增按钮操作 */
function handleAdd() {
  reset();
  getPostAndRoleAllFn();
  open.value = true;
  title.value = "添加用户";
  form.value.password = initPassword.value;
}
/** 修改按钮操作 */
function handleUpdate(row) {
  reset();
  const userId = row.userId;
  getUser(userId).then(res => {
    getPostAndRoleAllFn();
    const response = res.data;
    form.value = response.data;
    form.value.postIds = response.postIds;
    form.value.roleIds = response.roleIds;
    open.value = true;
    title.value = "修改用户";
    form.value.password = "";
  });
}
/** 提交按钮 */
function submitForm() {
  unref(userRef).validate(async valid => {
    if (valid) {
      const flag = form.value.userId != undefined;
      flag ? await updateUser(form.value) : await addUser(form.value);
      proxy.$message.success(flag ? "修改成功" : "新增成功");
      open.value = false;
      getList();
    }
  });
}

getDeptTree();
getList();
</script>
