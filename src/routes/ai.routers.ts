import { Router } from 'express';
import { aiController } from '../controllers/ai.controller';

const router = Router();

// POST /api/v1/ai/chat - Simple public AI shopping assistant conversation endpoint
router.post('/chat', aiController.chat);

export default router;
