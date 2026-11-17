import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['exceljs', '@prisma/client', 'bcryptjs', 'pdfkit'],
};
export default config;
