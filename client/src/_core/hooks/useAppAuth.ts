import { trpc } from "@/lib/trpc";

export function useAppAuth() {
  const { data: appUser, isLoading, refetch } = trpc.appUsers.me.useQuery();
  return {
    appUser: appUser ?? null,
    loading: isLoading,
    isOwner: appUser?.role === "owner",
    isAdmin: appUser?.role === "admin" || appUser?.role === "owner",
    refetch,
  };
}
