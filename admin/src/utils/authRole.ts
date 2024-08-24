import { useAuthStore } from "@/store/modules/auth";

function authRole(role) {
  const super_admin = "admin";
  const roles = useAuthStore().roles;
  if (role && role.length > 0) {
    return roles.some(v => {
      return super_admin === v || v === role;
    });
  } else {
    return false;
  }
}

export default {
  // 验证用户是否具备某角色
  hasRole(role) {
    return authRole(role);
  },
  // 验证用户是否含有指定角色，只需包含其中一个
  hasRoleOr(roles) {
    return roles.some(item => {
      return authRole(item);
    });
  },
  // 验证用户是否含有指定角色，必须全部拥有
  hasRoleAnd(roles) {
    return roles.every(item => {
      return authRole(item);
    });
  }
};
