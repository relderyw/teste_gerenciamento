import { Timestamp } from 'firebase/firestore';

export type BetResult = 'green' | 'red' | 'meio-green' | 'meio-red' | 'reembolso' | 'aguardando';

export interface Bet {
  id?: string;
  liga: string;
  jogador1: string;
  jogador2: string;
  mercado: string;
  stake: number;
  odds: number;
  resultado: BetResult;
  userEmail: string;
  timestamp: Timestamp | Date | any; // Handling Firebase timestamp nuances
}

export interface Market {
  id?: string;
  nome: string;
  categoria: string; // Nova propriedade
  userEmail: string;
  timestamp?: any;
}

export interface ChartDataPoint {
  date: string;
  balance: number;
}