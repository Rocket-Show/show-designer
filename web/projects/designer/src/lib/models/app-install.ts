// What the host application offers to install the designer as an app with (the online designer, a progressive web
// app): whether the browser offers it now, and the browser's own prompt
export interface AppInstall {
  available(): boolean;
  install(): Promise<void>;
}
