import { z } from 'zod';

export const userRegisterSchema = z.object({
  name: z
    .string({ message: 'Name is required' }),
  document: z
    .string({ message: 'Document is required' }),
  email: z
    .string({ message: 'Email is required' })
    .email({ message: 'Invalid email' }),
  password: z
    .string({ message: 'Password is required' })
    .min(8, { message: 'Password must be at least 8 characters' }),
});

export const userLoginSchema = z.object({
  email: z
    .string({ message: 'Email is required' })
    .email({ message: 'Invalid email' }),
  password: z
    .string({ message: 'Password is required' }),
});
