// utils/validators.js
export const validators = {
  minLength: (min) => (value) => {
    if (value.length < min) {
      return { valid: false, error: `Mínimo ${min} caracteres` };
    }
    return { valid: true };
  },
  
  maxLength: (max) => (value) => {
    if (value.length > max) {
      return { valid: false, error: `Máximo ${max} caracteres` };
    }
    return { valid: true };
  },
  
  url: (value) => {
    try {
      new URL(value);
      return { valid: true };
    } catch {
      return { valid: false, error: "URL inválida" };
    }
  },
  
  range: (min, max) => (value) => {
    if (value < min || value > max) {
      return { valid: false, error: `Debe estar entre ${min} y ${max}` };
    }
    return { valid: true };
  }
};