import { prisma } from '../db/prisma';
import { salesDrive } from '../salesdrive/fromEnv';
import { createDocumentService } from './documents';

/** SalesDrive client is created on first use (getter), so actions that don't need it never require its env. */
export const documentService = () => createDocumentService({ prisma, get sd() { return salesDrive(); } });
