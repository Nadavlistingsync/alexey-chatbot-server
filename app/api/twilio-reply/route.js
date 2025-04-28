export const runtime = 'nodejs';
import { NextResponse } from 'next/server';

export async function POST(req) {
  return NextResponse.json({
    message: 'Webhook received!',
    timestamp: new Date().toISOString(),
  });
} 