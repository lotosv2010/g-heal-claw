/// <reference types="vite/client" />

declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

declare module "@g-heal-claw/sdk" {
  export function init(options: any, config?: any): void;
  export function contextPlugin(): any;
  export function breadcrumbPlugin(): any;
  export function errorPlugin(): any;
  export function httpPlugin(options?: any): any;
  export function apiPlugin(options?: any): any;
  export function performancePlugin(): any;
  export function pageViewPlugin(): any;
  export function resourcePlugin(): any;
  export function customPlugin(): any;
  export function trackPlugin(options?: any): any;
}
