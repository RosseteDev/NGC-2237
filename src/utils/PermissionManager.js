export default class PermissionManager {
  static check(context, requiredPerms) {
    // Bot permissions
    const botMember = context.guild.members.me;
    const missingBot = requiredPerms.bot?.filter(
      perm => !botMember.permissions.has(perm)
    ) || [];
    
    if (missingBot.length > 0) {
      return {
        allowed: false,
        type: 'bot',
        missing: missingBot
      };
    }
    
    // User permissions
    const missingUser = requiredPerms.user?.filter(
      perm => !context.member.permissions.has(perm)
    ) || [];
    
    if (missingUser.length > 0) {
      return {
        allowed: false,
        type: 'user',
        missing: missingUser
      };
    }
    
    return { allowed: true };
  }
}