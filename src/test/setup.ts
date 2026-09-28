import '@testing-library/jest-dom/vitest'

// jsdom does not implement scrolling. (Node-environment test files have no window.)
if (typeof window !== 'undefined') window.scrollTo = () => {}
