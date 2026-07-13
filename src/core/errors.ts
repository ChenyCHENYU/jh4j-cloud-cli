export class UserCancelledError extends Error {
  constructor() {
    super("用户取消创建");
    this.name = "UserCancelledError";
  }
}
