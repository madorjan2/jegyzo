// Mock payment service provider (BR-13): the outcome is determined by the
// card number (spaces removed). Every attempt returns a unique pspReference
// in MOCK-<6 hex> format (BR-13 3.3).
import { Injectable } from '@nestjs/common';

export interface PspResult {
  status: 'SIKERES' | 'ELUTASITOTT' | 'IDOTULLEPES' | 'FELDOLGOZASI_HIBA';
  errorCode?: string;
  pspReference: string;
}

const OUTCOME_BY_CARD: Record<string, { status: PspResult['status']; errorCode?: string }> = {
  '4242424242424242': { status: 'SIKERES' },
  '4000000000000002': { status: 'ELUTASITOTT', errorCode: 'PAYMENT_DECLINED' },
  '4000000000009995': { status: 'ELUTASITOTT', errorCode: 'PAYMENT_INSUFFICIENT_FUNDS' },
  '4000000000000069': { status: 'ELUTASITOTT', errorCode: 'CARD_EXPIRED' },
  '4000000000000101': { status: 'ELUTASITOTT', errorCode: 'CARD_CVC_INVALID' },
  '4000000000000119': { status: 'FELDOLGOZASI_HIBA', errorCode: 'PAYMENT_PROCESSING_ERROR' },
  '4111111111111111': { status: 'IDOTULLEPES', errorCode: 'PAYMENT_TIMEOUT' },
};

export function luhnValid(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0, alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) { n *= 2; if (n > 9) n -= 9; }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

@Injectable()
export class MockPspService {
  charge(cardNumber: string): PspResult {
    const normalized = cardNumber.replace(/\s+/g, '');
    const outcome = OUTCOME_BY_CARD[normalized];
    const status = outcome?.status ?? (luhnValid(normalized) ? 'SIKERES' : 'FELDOLGOZASI_HIBA');
    const errorCode = outcome?.errorCode ?? (status === 'FELDOLGOZASI_HIBA' ? 'CARD_INVALID_NUMBER' : undefined);
    // every attempt gets a unique reference, MOCK-<6 hex>
    const pspReference = 'MOCK-' + Math.random().toString(16).slice(2, 8).toUpperCase().padEnd(6, '0');
    return { status, errorCode, pspReference };
  }
}
