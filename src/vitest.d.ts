// Traz os matchers do @testing-library/jest-dom (toBeInTheDocument, etc.) para o typecheck
// dos testes em src/**/*.test.tsx. O import real (side-effect) fica em vitest.setup.ts —
// este arquivo só garante que o augment de tipos entre no mesmo `tsconfig` (rootDir: src).
import '@testing-library/jest-dom/vitest';
