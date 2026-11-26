import { vi } from "vitest";

export const testCookieJar = new Map<string, string>();

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const val = testCookieJar.get(name);
      return val !== undefined ? { name, value: val } : undefined;
    },
    set: (name: string, value: string) => {
      testCookieJar.set(name, value);
    },
    delete: (name: string) => {
      testCookieJar.delete(name);
    },
  }),
}));
