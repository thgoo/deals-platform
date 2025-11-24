class PasswordService {
  async hashPassword(password: string): Promise<string> {
    return Bun.password.hash(password);
  }

  async verifyPasswordHash(
    password: string,
    hash: string,
  ): Promise<boolean> {
    return Bun.password.verify(password, hash);
  }
}

export default PasswordService;
