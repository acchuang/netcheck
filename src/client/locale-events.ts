type LocaleChangeCallback = () => void;
const callbacks: LocaleChangeCallback[] = [];

export function onLocaleChange(cb: LocaleChangeCallback): void {
  callbacks.push(cb);
}

export function notifyLocaleChange(): void {
  callbacks.forEach((cb) => cb());
}