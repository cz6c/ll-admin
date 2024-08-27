<template>
  <div class="app-page">
    <el-form v-show="showSearch" ref="queryRef" :model="queryParams" :inline="true">
      <el-form-item label="菜单名称" prop="menuName">
        <el-input
          v-model="queryParams.menuName"
          placeholder="请输入菜单名称"
          clearable
          style="width: 200px"
          @keyup.enter="handleQuery"
        />
      </el-form-item>
      <el-form-item label="状态" prop="status">
        <el-select v-model="queryParams.status" placeholder="菜单状态" clearable style="width: 200px">
          <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
        </el-select>
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
        <el-button type="info" plain icon="Sort" @click="toggleExpandAll">展开/折叠</el-button>
      </el-col>
      <!-- <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" /> -->
    </el-row>

    <el-table
      v-if="refreshTable"
      v-loading="loading"
      :data="menuList"
      row-key="menuId"
      :default-expand-all="isExpandAll"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column prop="menuName" label="菜单名称" :show-overflow-tooltip="true" width="160" />
      <el-table-column prop="icon" label="图标" align="center" width="100">
        <template #default="scope">
          <svg-icon :name="scope.row.icon" />
        </template>
      </el-table-column>
      <el-table-column prop="orderNum" label="排序" width="60" />
      <el-table-column prop="component" label="组件路径" :show-overflow-tooltip="true" />
      <el-table-column prop="perm" label="功能权限标识" :show-overflow-tooltip="true" />
      <el-table-column prop="status" label="状态" width="80">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column label="创建时间" align="center" width="160" prop="createTime">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" align="center" width="210" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            v-auth="'edit'"
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row, scope.row.menuType !== 'M')"
          >
            修改
          </el-button>
          <el-button
            v-if="scope.row.menuType === 'M'"
            v-auth="'add'"
            link
            type="primary"
            :icon="scope.row.parentId !== 0 ? 'Pointer' : 'Plus'"
            @click="handleAdd(scope.row, scope.row.parentId !== 0)"
          >
            {{ scope.row.parentId !== 0 ? "功能" : "新增" }}
          </el-button>
          <el-button v-auth="'remove'" link type="primary" icon="Delete" @click="handleDelete(scope.row)">
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 添加或修改菜单对话框 -->
    <el-dialog v-model="open" :title="title" width="680px" append-to-body>
      <el-form ref="menuRef" :model="form" :rules="rules" label-width="100px">
        <el-row>
          <el-col v-if="form.menuType === 'M'" :span="24">
            <el-form-item label="上级菜单">
              <el-tree-select
                v-model="form.parentId"
                :data="menuOptions"
                :props="{
                  value: 'menuId',
                  label: 'menuName',
                  children: 'children'
                }"
                value-key="menuId"
                placeholder="选择上级菜单"
                check-strictly
              />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="24">
            <el-form-item label="菜单图标" prop="icon">
              <el-popover
                v-model:visible="showChooseIcon"
                placement="bottom-start"
                :width="540"
                trigger="click"
                @show="showSelectIcon"
              >
                <template #reference>
                  <el-input
                    v-model="form.icon"
                    v-click-outside="hideSelectIcon"
                    placeholder="点击选择图标"
                    readonly
                    @blur="showSelectIcon"
                  >
                    <template #prefix>
                      <svg-icon
                        v-if="form.icon"
                        :name="form.icon"
                        class="el-input__icon"
                        style="height: 32px; width: 16px"
                      />
                      <el-icon v-else style="height: 32px; width: 16px"><search /></el-icon>
                    </template>
                  </el-input>
                </template>
                <icon-select ref="iconSelectRef" :active-icon="form.icon" @selected="selected" />
              </el-popover>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="`${form.menuType === 'M' ? '菜单' : '功能'}名称`" prop="menuName">
              <el-input v-model="form.menuName" :placeholder="`请输入${form.menuType === 'M' ? '菜单' : '功能'}名称`" />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item label="显示排序" prop="orderNum">
              <el-input-number v-model="form.orderNum" controls-position="right" :min="0" />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item prop="isFrame">
              <template #label>
                <span>
                  <el-tooltip content="选择是外链则路由地址需要以`http(s)://`开头" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  是否外链
                </span>
              </template>
              <el-radio-group v-model="form.isFrame">
                <el-radio label="0">是</el-radio>
                <el-radio label="1">否</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="24">
            <el-form-item prop="path">
              <template #label>
                <span>
                  <el-tooltip content="访问的路由地址，如：`user`，如外网地址需以`http(s)://`开头" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  路由地址
                </span>
              </template>
              <el-input v-model="form.path" placeholder="请输入路由地址" />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="24">
            <el-form-item prop="component">
              <template #label>
                <span>
                  <el-tooltip content="组件路径，如：`system/user/index`，默认在`views`目录下" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  组件路径
                </span>
              </template>
              <el-input v-model="form.component" placeholder="请输入组件路径" />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item prop="name">
              <template #label>
                <span>
                  <el-tooltip content="组件name，需与页面组件name一致，使用大驼峰命名，如：`User`" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  组件名称
                </span>
              </template>
              <el-input v-model="form.name" placeholder="请输入组件名称" />
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item prop="isCache">
              <template #label>
                <span>
                  <el-tooltip content="选择缓存则会被`keep-alive`缓存，需与组件名称匹配" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  缓存状态
                </span>
              </template>
              <el-radio-group v-model="form.isCache">
                <el-radio label="0">缓存</el-radio>
                <el-radio label="1">不缓存</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item prop="activeMenu">
              <el-input v-model="form.activeMenu" placeholder="请输入高亮菜单" maxlength="255" />
              <template #label>
                <span>
                  <el-tooltip content="路由隐藏时，则会高亮设置的菜单路由侧边栏" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  高亮菜单
                </span>
              </template>
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'M'" :span="12">
            <el-form-item prop="visible">
              <template #label>
                <span>
                  <el-tooltip content="选择隐藏则路由将不会出现在侧边栏，但仍然可以访问" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  显示状态
                </span>
              </template>
              <el-radio-group v-model="form.visible">
                <el-radio v-for="dict in sys_show_hide" :key="dict.value" :label="dict.value">{{
                  dict.label
                }}</el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col v-if="form.menuType === 'F'" :span="24">
            <el-form-item prop="perm">
              <template #label>
                <span>
                  <el-tooltip content="页面功能权限标识，如`add,edit`" placement="top">
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                  功能标识
                </span>
              </template>
              <el-input v-model="form.perm" placeholder="请输入功能标识" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item prop="status" label="启用状态">
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.value">{{
                  dict.label
                }}</el-radio>
              </el-radio-group>
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
  </div>
</template>

<script setup>
import { addMenu, delMenu, getMenu, listMenu, updateMenu } from "@/api/system/menu";
import IconSelect from "@/components/IconSelect/index.vue";
import { ClickOutside as vClickOutside } from "element-plus";

defineOptions({
  name: "MenuIndex"
});

const { proxy } = getCurrentInstance();
const { sys_show_hide, sys_normal_disable } = proxy.useDict("sys_show_hide", "sys_normal_disable");

const menuList = ref([]);
const open = ref(false);
const loading = ref(true);
const showSearch = ref(true);
const title = ref("");
const menuOptions = ref([]);
const isExpandAll = ref(false);
const refreshTable = ref(true);
const showChooseIcon = ref(false);
const iconSelectRef = ref(null);

const data = reactive({
  form: {},
  queryParams: {
    menuName: undefined,
    visible: undefined
  },
  rules: {
    menuName: [{ required: true, message: "菜单名称不能为空", trigger: "blur" }],
    orderNum: [{ required: true, message: "菜单顺序不能为空", trigger: "blur" }],
    path: [{ required: true, message: "路由地址不能为空", trigger: "blur" }],
    name: [{ required: true, message: "组件名称不能为空", trigger: "blur" }],
    component: [{ required: true, message: "组件路径不能为空", trigger: "blur" }],
    perm: [{ required: true, message: "功能标识不能为空", trigger: "blur" }]
  }
});

const { queryParams, form, rules } = toRefs(data);

watch(
  () => data.form.isFrame,
  val => {
    data.rules.name[0].required = val !== "0";
    data.rules.component[0].required = val !== "0";
  }
);

/** 查询菜单列表 */
function getList() {
  loading.value = true;
  listMenu(queryParams.value).then(response => {
    menuList.value = proxy.handleTree(response.data, "menuId");
    loading.value = false;
  });
}
/** 查询菜单下拉树结构 */
function getTreeselect() {
  menuOptions.value = [];
  listMenu({ parentId: 0 }).then(response => {
    const menu = { menuId: 0, menuName: "主类目", children: [] };
    menu.children = proxy.handleTree(response.data, "menuId");
    menuOptions.value.push(menu);
  });
}
/** 取消按钮 */
function cancel() {
  open.value = false;
  reset();
}
/** 表单重置 */
function reset() {
  form.value = {
    menuId: undefined,
    parentId: 0,
    menuName: "",
    icon: undefined,
    orderNum: undefined,
    isFrame: "1",
    isCache: "0",
    visible: "0",
    activeMenu: "",
    status: "0",
    name: "",
    perm: "",
    menuType: "M",
    path: ""
  };
  proxy.resetForm("menuRef");
}
/** 展示下拉图标 */
function showSelectIcon() {
  iconSelectRef.value.reset();
  showChooseIcon.value = true;
}
/** 选择图标 */
function selected(name) {
  form.value.icon = name;
  showChooseIcon.value = false;
}
/** 图标外层点击隐藏下拉列表 */
function hideSelectIcon(event) {
  var elem = event.relatedTarget || event.srcElement || event.target || event.currentTarget;
  var className = elem.className;
  if (className !== "el-input__inner") {
    showChooseIcon.value = false;
  }
}
/** 搜索按钮操作 */
function handleQuery() {
  getList();
}
/** 重置按钮操作 */
function resetQuery() {
  proxy.resetForm("queryRef");
  handleQuery();
}
/** 新增按钮操作 */
function handleAdd(row, isPerm = false) {
  reset();
  !isPerm && getTreeselect();
  if (row != null && row.menuId) {
    form.value.parentId = row.menuId;
  } else {
    form.value.parentId = 0;
  }
  isPerm && (form.value.menuType = "F");
  title.value = !isPerm ? "添加菜单" : "添加功能";
  open.value = true;
}
/** 展开/折叠操作 */
function toggleExpandAll() {
  refreshTable.value = false;
  isExpandAll.value = !isExpandAll.value;
  nextTick(() => {
    refreshTable.value = true;
  });
}
/** 修改按钮操作 */
async function handleUpdate(row, isPerm = false) {
  reset();
  !isPerm && (await getTreeselect());
  getMenu(row.menuId).then(response => {
    form.value = response.data;
    isPerm && (form.value.menuType = "F");
    title.value = !isPerm ? "修改菜单" : "修改功能";
    open.value = true;
  });
}
/** 提交按钮 */
function submitForm() {
  proxy.$refs["menuRef"].validate(valid => {
    if (valid) {
      const params = { ...form.value };
      if (form.value.menuId != undefined) {
        updateMenu(params).then(response => {
          proxy.$modal.msgSuccess("修改成功");
          open.value = false;
          getList();
        });
      } else {
        addMenu(params).then(response => {
          proxy.$modal.msgSuccess("新增成功");
          open.value = false;
          getList();
        });
      }
    }
  });
}
/** 删除按钮操作 */
function handleDelete(row) {
  proxy.$modal
    .confirm('是否确认删除名称为"' + row.menuName + '"的数据项?')
    .then(function () {
      return delMenu(row.menuId);
    })
    .then(() => {
      getList();
      proxy.$modal.msgSuccess("删除成功");
    })
    .catch(() => {});
}

getList();
</script>
