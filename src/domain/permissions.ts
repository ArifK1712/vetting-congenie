import type { Database, ID, Permission, Team } from "./types";

export function can(db: Database, userId: ID, permission: Permission): boolean {
  const user = db.users[userId];
  if (!user?.active) return false;
  return db.roles[user.roleId]?.permissions.includes(permission) ?? false;
}

export function permissionsOf(db: Database, userId: ID): Set<Permission> {
  const user = db.users[userId];
  if (!user?.active) return new Set();
  return new Set(db.roles[user.roleId]?.permissions ?? []);
}

export function teamsOfUser(db: Database, userId: ID): Team[] {
  return Object.values(db.teams).filter(
    (t) => t.status === "active" && t.members.some((m) => m.userId === userId),
  );
}

export function isTeamLead(db: Database, userId: ID, teamId: ID): boolean {
  return db.teams[teamId]?.members.some((m) => m.userId === userId && m.role === "lead") ?? false;
}
