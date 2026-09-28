/// <reference types="vite/client" />

// Vite's own asset typings do not cover woff2.
declare module '*.woff2' {
  const src: string
  export default src
}
