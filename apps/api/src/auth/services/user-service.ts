import { eq } from 'drizzle-orm';
import type { NewUser } from '~/db/schemas/users';
import db from '~/db';
import { usersTable } from '~/db/schemas/users';

class UserService {
  async userExists(email: string) {
    const result = await db
      .select({ id: usersTable.id })
      .from(usersTable)
      .where(eq(usersTable.email, email));

    return result.length > 0;
  }

  async getUserByEmail(email: string) {
    const result = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email));

    return result[0] || null;
  }

  async createUser(user: NewUser): Promise<{ id: number }[]> {
    return await db.insert(usersTable).values(user).$returningId();
  }
}

export default UserService;
