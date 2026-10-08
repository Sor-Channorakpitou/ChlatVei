import { config } from 'dotenv';
import { join } from 'path';

// Point the app at the TEST database before any module reads the environment.
config({ path: join(__dirname, '..', '.env'), quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error('TEST_DATABASE_URL is not set (see backend/.env.example)');
process.env.DATABASE_URL = testUrl;
process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.JWT_ACCESS_SECRET ??= 'test-secret-that-is-long-enough-for-validation-0123456789';
// Extraction jobs read source text from DATA_DIR; tests use a throwaway folder, never the repo's data.
process.env.DATA_DIR = require('path').join(require('os').tmpdir(), 'chlatvei-e2e-data');
