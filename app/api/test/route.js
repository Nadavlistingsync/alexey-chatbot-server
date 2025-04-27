export const runtime = 'nodejs';

import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({ 
    message: 'Test API route is working',
    timestamp: new Date().toISOString()
  });
} 