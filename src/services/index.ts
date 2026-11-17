import { prisma } from '../db/prisma';
import { salesDrive } from '../salesdrive/fromEnv';
import { createDocumentService } from './documents';

export const documentService = () => createDocumentService({ prisma, sd: salesDrive() });
