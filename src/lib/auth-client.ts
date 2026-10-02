import { createAuthClient } from "better-auth/react";

// Gleicher Ursprung: /api/auth ist der Standardpfad, keine baseURL nötig.
export const authClient = createAuthClient();

export const { signIn, signUp, signOut, useSession } = authClient;
