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
  bankrollId?: string; // ID do gerenciamento
}

export interface Bankroll {
  id?: string;
  name: string;
  initialCapital: number;
  unitValue: number;
  userEmail: string;
  isDefault?: boolean;
}

export interface Market {
  id?: string;
  nome: string;
  categoria: string; // Nova propriedade
  userEmail: string;
  timestamp?: any;
  hidden?: boolean;
}

export interface ChartDataPoint {
  date: string;
  balance: number;
}