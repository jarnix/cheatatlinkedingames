import { defineConfig } from 'wxt';

export default defineConfig({
  manifestVersion: 3,
  manifest: {
    name: 'LinkedIn Game Cheater',
    description: 'Solves LinkedIn puzzle games instantly.',
    permissions: ['debugger'],
    host_permissions: ['https://www.linkedin.com/games/*'],
  },
});
