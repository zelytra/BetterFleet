import { customRef } from "vue";

export default function (key: string, defaultValue: any) {
  return customRef((track, trigger) => ({
    get: () => {
      track();
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : defaultValue;
    },
    set: (value) => {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
      trigger();
    },
  }));
}

export enum LocalKey {
  USER_STORE = "user-store",
}
