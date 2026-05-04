import { z } from "zod";

export const UserProfileSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string().nullable(),
  role: z.string(),
  isActive: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
});

export type UserProfile = z.infer<typeof UserProfileSchema>;

export const AuthTokensSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
});

export const LoginResponseSchema = z.object({
  data: z.object({
    ...AuthTokensSchema.shape,
    user: UserProfileSchema,
  }),
});

export const RefreshResponseSchema = z.object({
  data: AuthTokensSchema,
});

export const MeResponseSchema = z.object({
  data: z.object({ user: UserProfileSchema }),
});
