// utils/CooldownManager.js
export default class CooldownManager {
  constructor() {
    this.cooldowns = new Map();
  }

  check(userId, commandName, seconds = 3) {
    const key = `${userId}-${commandName}`;
    const now = Date.now();
    
    if (this.cooldowns.has(key)) {
      const expiresAt = this.cooldowns.get(key);
      
      if (now < expiresAt) {
        const remaining = ((expiresAt - now) / 1000).toFixed(1);
        return { allowed: false, remaining };
      }
    }
    
    this.cooldowns.set(key, now + (seconds * 1000));
    return { allowed: true };
  }

  reset(userId, commandName) {
    this.cooldowns.delete(`${userId}-${commandName}`);
  }
}