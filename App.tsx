import React, { useState, useEffect, useMemo } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  addDoc, 
  deleteDoc, 
  doc, 
  serverTimestamp, 
  setDoc,
  onSnapshot
} from 'firebase/firestore';
import { db } from './services/firebase';
import { Bet, BetResult, ChartDataPoint, Market, Bankroll } from './types';
import { SummaryCard } from './components/SummaryCard';
import { BetChart } from './components/BetChart';
import {
  Trophy,
  Wallet,
  Target,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  LayoutDashboard,
  FileText,
  Settings,
  Coins,
  RefreshCw,
  Save,
  Calendar,
  Pencil,
  ChevronDown,
  ChevronUp,
  X,
  Copy,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff
} from 'lucide-react';

interface Category {
  id: string;
  nome: string;
  order?: number;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Categorias de Mercados Solicitadas
const MARKET_CATEGORIES = [
  'GOLS HT',
  'GOLS FT',
  'AMBAS',
  'ML JOGADORES',
  'WIN JOGADOR',
  'DUTCHING',
  'OUTROS'
];

// Mapeamento de ligas da API para o sistema
const mapLeagueName = (apiName: string) => {
  if (apiName.includes("8 mins") && apiName.includes("H2H")) return "Battle 8 min (H2H)";
  if (apiName.includes("6 mins")) return "Battle 6 min";
  if (apiName.includes("8 mins")) return "Battle 8 min";
  if (apiName.includes("10 mins")) return "Adriact 10 min";
  if (apiName.includes("12 mins")) return "GT 12 min";
  return "Outro";
};

const extractPlayerName = (text: string) => {
  const match = text.match(/\(([^)]+)\)/);
  return match ? match[1].trim() : text.trim();
};

const initialFormState = {
  liga: '',
  jogador1: '',
  jogador2: '',
  mercado: '',
  stake: '',
  odds: '',
  resultado: 'aguardando' as BetResult
};

export default function App() {
  // State
  const [activeTab, setActiveTab] = useState<'dashboard' | 'new-bet' | 'markets' | 'settings'>('dashboard');
  const [isLeagueStatsOpen, setIsLeagueStatsOpen] = useState(false);
  const [bets, setBets] = useState<Bet[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [marketCategories, setMarketCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Date Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Config State
  const [bankrolls, setBankrolls] = useState<Bankroll[]>([]);
  const [activeBankrollId, setActiveBankrollId] = useState<string>('');
  const [configLoading, setConfigLoading] = useState(false);
  
  // Local state for editing
  const [localInitialBankroll, setLocalInitialBankroll] = useState(1000);
  const [localUnitValue, setLocalUnitValue] = useState(100);
  
  // Computed active bankroll
  const activeBankroll = useMemo(() => 
    bankrolls.find(b => b.id === activeBankrollId) || bankrolls[0], 
  [bankrolls, activeBankrollId]);

  // Sync local state when active bankroll changes
  useEffect(() => {
    if (activeBankroll) {
      setLocalInitialBankroll(activeBankroll.initialCapital);
      setLocalUnitValue(activeBankroll.unitValue);
    }
  }, [activeBankroll]);

  // Derived values from active bankroll (for stats)
  const initialBankroll = activeBankroll?.initialCapital || 1000;
  const unitValue = activeBankroll?.unitValue || 100;
  
  // Players Cache
  const [playersCache, setPlayersCache] = useState<Record<string, Set<string>>>({});
  const [loadingPlayers, setLoadingPlayers] = useState(false);

  // Auth State
  const [userEmail, setUserEmail] = useState<string>('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  // Form State
  const [formData, setFormData] = useState(initialFormState);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketCategory, setNewMarketCategory] = useState('');
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isMarketOptionsOpen, setIsMarketOptionsOpen] = useState(false);

  // Set initial category when categories load
  useEffect(() => {
    if (marketCategories.length > 0 && !newMarketCategory) {
      setNewMarketCategory(marketCategories[0].nome);
    }
  }, [marketCategories]);

  // --- Auth & Initial Setup ---
  useEffect(() => {
    const savedUser = localStorage.getItem('currentUser');
    if (savedUser) {
      setUserEmail(savedUser);
      setIsLoggedIn(true);
    }
  }, []);

  // --- Realtime Listeners ---
  
  // 1. Bets Listener
  useEffect(() => {
    if (!isLoggedIn || !userEmail) return;
    setLoading(true);

    const q = query(
      collection(db, 'apostas'),
      where('userEmail', '==', userEmail),
      orderBy('timestamp', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedBets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Bet[];
      setBets(fetchedBets);
      setLoading(false);
    }, (error) => {
      console.error("Error watching bets:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isLoggedIn, userEmail]);

  // 2. Markets Listener
  useEffect(() => {
    if (!isLoggedIn) return;

    const q = collection(db, 'mercados');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedMarkets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Market[];
      
      // Sort by category then name
      fetchedMarkets.sort((a, b) => {
        if (a.categoria === b.categoria) {
          return a.nome.localeCompare(b.nome);
        }
        return (a.categoria || '').localeCompare(b.categoria || '');
      });
      
      setMarkets(fetchedMarkets);
    });

    return () => unsubscribe();
  }, [isLoggedIn]);

  // 4. Market Categories Listener (carrega do Firebase)
  useEffect(() => {
    if (!isLoggedIn) return;

    const q = collection(db, 'categorias');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedCategories = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Category[];
      
      if (fetchedCategories.length > 0) {
        // Sort client-side to handle missing 'order' fields safely
        fetchedCategories.sort((a, b) => {
          const orderA = a.order ?? Number.MAX_SAFE_INTEGER;
          const orderB = b.order ?? Number.MAX_SAFE_INTEGER;
          
          if (orderA !== orderB) {
            return orderA - orderB;
          }
          return a.nome.localeCompare(b.nome);
        });
        setMarketCategories(fetchedCategories);
      } else {
        // Fallback: Create default categories in Firestore if none exist
        const defaultCats = MARKET_CATEGORIES.map((name, index) => ({
          id: `default_${index}`,
          nome: name,
          order: index
        }));
        setMarketCategories(defaultCats);
      }
    });

    return () => unsubscribe();
  }, [isLoggedIn]);

  // 3. Bankrolls Listener & Migration
  useEffect(() => {
    if (!isLoggedIn || !userEmail) return;
    setConfigLoading(true);

    const q = query(collection(db, 'bankrolls'), where('userEmail', '==', userEmail));
    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const fetchedBankrolls = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Bankroll[];

      if (fetchedBankrolls.length > 0) {
        setBankrolls(fetchedBankrolls);
        // If no active bankroll selected, select the first one (or default)
        if (!activeBankrollId) {
          const defaultBankroll = fetchedBankrolls.find(b => b.isDefault) || fetchedBankrolls[0];
          setActiveBankrollId(defaultBankroll.id!);
        }
      } else {
        // MIGRATION: No bankrolls found, create default from user config
        // Fetch legacy user config first
        try {
           const userDocRef = doc(db, 'users', userEmail);
           // We can't use getDoc here easily inside onSnapshot, but we can assume defaults or try to read once.
           // For simplicity, let's just create a default one.
           // If we wanted to preserve old values, we'd need to read them.
           // Let's try to read them from the 'users' collection if possible, or just default.
           
           // Actually, let's just create a "Principal" bankroll.
           const newBankroll: Bankroll = {
             name: "Principal",
             initialCapital: 1000, // Default or we could try to read from legacy
             unitValue: 100,
             userEmail,
             isDefault: true
           };
           
           const docRef = await addDoc(collection(db, 'bankrolls'), newBankroll);
           setActiveBankrollId(docRef.id);
        } catch (e) {
          console.error("Error creating default bankroll:", e);
        }
      }
      setConfigLoading(false);
    });

    return () => unsubscribe();
  }, [isLoggedIn, userEmail]);

  // --- API Integration ---
  const fetchPlayersFromAPI = async () => {
    setLoadingPlayers(true);
    try {
      const response = await fetch('https://api.green365.com.br/api/events/ended?sport_id=4&competition_id=&page=1');
      const data = await response.json();

      if (data && data.data) {
        const newCache: Record<string, Set<string>> = {};

        data.data.forEach((match: any) => {
          const league = mapLeagueName(match.leagueName);
          if (league !== "Outro") {
            if (!newCache[league]) newCache[league] = new Set();
            if (match.home) newCache[league].add(extractPlayerName(match.home));
            if (match.away) newCache[league].add(extractPlayerName(match.away));
          }
        });
        setPlayersCache(newCache);
      }
    } catch (error) {
      console.error("Erro ao buscar jogadores:", error);
    } finally {
      setLoadingPlayers(false);
    }
  };

  // Trigger API fetch on login
  useEffect(() => {
    if (isLoggedIn) fetchPlayersFromAPI();
  }, [isLoggedIn]);

  // --- Handlers ---
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const emailInput = (document.getElementById('email-login') as HTMLInputElement).value;
    if (emailInput) {
      localStorage.setItem('currentUser', emailInput);
      setUserEmail(emailInput);
      setIsLoggedIn(true);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    setIsLoggedIn(false);
    setBets([]);
  };

  const handleSaveConfig = async () => {
    if (!activeBankrollId) return;
    try {
      await setDoc(doc(db, 'bankrolls', activeBankrollId), {
        initialCapital: initialBankroll, // These are now derived from state, but we need to update them
        // Wait, initialBankroll is derived from activeBankroll.
        // We need local state for the form editing.
      }, { merge: true });
      // Actually, let's handle this in the Settings tab directly with specific handlers
    } catch (error) {
      console.error("Erro ao salvar configurações:", error);
    }
  };

  const handleUpdateBankroll = async (id: string, data: Partial<Bankroll>) => {
    try {
      await setDoc(doc(db, 'bankrolls', id), data, { merge: true });
      alert('Configurações atualizadas!');
    } catch (error) {
      console.error("Error updating bankroll:", error);
      alert("Erro ao atualizar.");
    }
  };

  const handleCreateBankroll = async (name: string, initial: number, unit: number) => {
    try {
      const newBankroll: Bankroll = {
        name,
        initialCapital: initial,
        unitValue: unit,
        userEmail
      };
      const docRef = await addDoc(collection(db, 'bankrolls'), newBankroll);
      setActiveBankrollId(docRef.id); // Switch to new bankroll
      alert(`Banca "${name}" criada com sucesso!`);
    } catch (error) {
      console.error("Error creating bankroll:", error);
      alert("Erro ao criar banca.");
    }
  };

  const startEditing = (bet: Bet) => {
    setFormData({
      liga: bet.liga,
      jogador1: bet.jogador1,
      jogador2: bet.jogador2,
      mercado: bet.mercado,
      stake: bet.stake.toString(),
      odds: bet.odds.toString(),
      resultado: bet.resultado
    });
    setEditingId(bet.id || null);
    setActiveTab('new-bet');
  };

  const copyBet = (bet: Bet) => {
    setFormData({
      liga: bet.liga,
      jogador1: bet.jogador1,
      jogador2: bet.jogador2,
      mercado: bet.mercado,
      stake: bet.stake.toString(),
      odds: bet.odds.toString(),
      resultado: 'aguardando' as BetResult
    });
    setEditingId(null); // Não é edição, é uma nova aposta
    setActiveTab('new-bet');
  };

  const cancelEditing = () => {
    setEditingId(null);
    setFormData(initialFormState);
  };

  const handleBetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.liga || !formData.jogador1 || !formData.mercado || !formData.stake || !formData.odds) {
      alert("Preencha todos os campos obrigatórios.");
      return;
    }

    try {
      const betData = {
        ...formData,
        stake: parseFloat(formData.stake.toString().replace(',', '.')),
        odds: parseFloat(formData.odds.toString().replace(',', '.')),
        userEmail,
        bankrollId: activeBankrollId, // Associate with active bankroll
        // Só atualiza o timestamp se for uma nova aposta, para manter a data original na edição
        ...(editingId ? {} : { timestamp: serverTimestamp() })
      };

      if (editingId) {
        await setDoc(doc(db, 'apostas', editingId), betData, { merge: true });
        setEditingId(null);
      } else {
        await addDoc(collection(db, 'apostas'), betData);
      }
      
      setFormData(initialFormState);
      setActiveTab('dashboard');
    } catch (error) {
      console.error("Error saving bet:", error);
      alert("Erro ao salvar aposta.");
    }
  };

  const handleDeleteBet = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log("Tentando excluir aposta:", id);
    if (!id) {
      console.error("ID da aposta não encontrado");
      return;
    }
    
    if (window.confirm('Tem certeza que deseja excluir esta aposta permanentemente?')) {
      try {
        await deleteDoc(doc(db, 'apostas', id));
        console.log("Aposta excluída com sucesso");
      } catch (error) {
        console.error("Erro ao excluir aposta:", error);
        alert("Erro ao excluir aposta.");
      }
    }
  };

  const handleUpdateResult = async (id: string, newResult: BetResult) => {
    try {
      const betRef = doc(db, 'apostas', id);
      await setDoc(betRef, { resultado: newResult }, { merge: true });
    } catch (error) {
      console.error(error);
    }
  };

  const handleAddMarket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMarketName) return;
    try {
      await addDoc(collection(db, 'mercados'), {
        nome: newMarketName,
        categoria: newMarketCategory,
        userEmail,
        timestamp: serverTimestamp()
      });
      setNewMarketName('');
    } catch (error) {
      console.error(error);
    }
  };

  const handleDeleteMarket = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();

    console.log("Tentando excluir mercado:", id);
    if (!id) {
      console.error("ID do mercado não encontrado");
      return;
    }

    if (window.confirm('Remover este mercado?')) {
      try {
        await deleteDoc(doc(db, 'mercados', id));
        console.log("Mercado excluído com sucesso");
      } catch (error) {
        console.error("Erro ao excluir mercado:", error);
        alert("Erro ao excluir mercado.");
      }
    }
  };

  const handleMoveCategory = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === marketCategories.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    const itemA = marketCategories[index];
    const itemB = marketCategories[targetIndex];

    // Ensure both have valid order values before swapping
    // If order is missing, default to their current array index
    const orderA = itemA.order ?? index;
    const orderB = itemB.order ?? targetIndex;

    // If they were relying on default sort (no order), we need to give them explicit orders now
    // Actually, simply swapping their target orders is enough.
    // If A was at index (order=index) and B at targetIndex (order=targetIndex)
    // We want A to have targetIndex and B to have index.
    
    // However, to be robust, let's assign orders to ALL categories if they are missing
    // But that's too many writes.
    
    // Let's just swap the values we think they should have.
    // We want itemA to take itemB's position and vice versa.
    
    // If the list is currently sorted by order, then itemA.order < itemB.order (if down) or > (if up)
    // But if 'order' is undefined, they are sorted by name or MAX_INT.
    
    // Strategy: Assign explicit orders to these two items based on the desired outcome.
    // To guarantee they swap, we can swap their indices.
    
    // Let's assume the current list index IS the desired order.
    // So itemA is at 'index', itemB is at 'targetIndex'.
    // We want itemA to move to 'targetIndex' and itemB to 'index'.
    
    try {
      await setDoc(doc(db, 'categorias', itemA.id), { order: targetIndex }, { merge: true });
      await setDoc(doc(db, 'categorias', itemB.id), { order: index }, { merge: true });
      
      // Note: If other items don't have 'order', they might jump around.
      // Ideally, we should initialize 'order' for all items once.
      // But let's try this minimal approach first.
    } catch (error) {
      console.error("Error reordering categories:", error);
      alert("Erro ao reordenar categorias.");
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;
    
    try {
      await addDoc(collection(db, 'categorias'), {
        nome: newCategoryName.trim(),
        order: marketCategories.length // Append to end
      });
      setNewCategoryName('');
    } catch (error) {
      console.error("Error adding category:", error);
      alert("Erro ao adicionar categoria.");
    }
  };

  const handleToggleMarketVisibility = async (e: React.MouseEvent, market: Market) => {
    e.preventDefault();
    e.stopPropagation();
    if (!market.id) return;

    try {
      await setDoc(doc(db, 'mercados', market.id), { hidden: !market.hidden }, { merge: true });
    } catch (error) {
      console.error("Error toggling market visibility:", error);
    }
  };

  // --- Calculations & Filtering ---

  const calculateProfit = (stake: number, odds: number, result: BetResult) => {
    switch (result) {
      case 'green': return stake * (odds - 1);
      case 'red': return -stake;
      case 'meio-green': return (stake / 2) * (odds - 1);
      case 'meio-red': return -stake / 2;
      case 'reembolso': return 0;
      default: return 0;
    }
  };

  const filteredBets = useMemo(() => {
    return bets.filter(bet => {
      if (!startDate && !endDate) return true;
      
      const betDate = bet.timestamp?.seconds ? new Date(bet.timestamp.seconds * 1000) : new Date();
      betDate.setHours(0,0,0,0);

      const start = startDate ? new Date(startDate) : null;
      if (start) start.setHours(0,0,0,0);

      const end = endDate ? new Date(endDate) : null;
      if (end) end.setHours(23,59,59,999);

      if (start && betDate < start) return false;
      if (end && betDate > end) return false;

      // Filter by Bankroll
      // If bet has no bankrollId, assume it belongs to the default bankroll
      if (activeBankroll?.isDefault) {
         return bet.bankrollId === activeBankrollId || !bet.bankrollId;
      }
      return bet.bankrollId === activeBankrollId;
    });
  }, [bets, startDate, endDate, activeBankrollId, activeBankroll]);

  const stats = useMemo(() => {
    let totalGain = 0;
    let totalLoss = 0;
    let greens = 0;
    let reds = 0;
    let refunds = 0;
    let pending = 0;

    filteredBets.forEach(bet => {
      const profit = calculateProfit(bet.stake, bet.odds, bet.resultado);
      if (profit > 0) {
        totalGain += profit;
        greens += (bet.resultado === 'meio-green' ? 0.5 : 1);
      } else if (profit < 0) {
        totalLoss += Math.abs(profit);
        reds += (bet.resultado === 'meio-red' ? 0.5 : 1);
      }
      
      if (bet.resultado === 'reembolso') refunds++;
      if (bet.resultado === 'aguardando') pending++;
    });

    const netBalance = totalGain - totalLoss;
    
    // For ROI calculation relative to initial bankroll
    const roi = initialBankroll > 0 ? (netBalance / initialBankroll) * 100 : 0;
    
    // Unidades ganhas/perdidas usando o valor da unidade configurado
    const netUnits = unitValue > 0 ? (netBalance / unitValue) : 0;
    
    // Chart Data Generation (Filtered)
    const sortedBets = [...filteredBets].sort((a, b) => {
       const dateA = a.timestamp?.seconds ? new Date(a.timestamp.seconds * 1000) : new Date();
       const dateB = b.timestamp?.seconds ? new Date(b.timestamp.seconds * 1000) : new Date();
       return dateA.getTime() - dateB.getTime();
    });

    let runningBalance = 0;
    const chartData: ChartDataPoint[] = [];
    const dailyBalances: Record<string, number> = {};

    // New Stats: Best League & Market
    const leagueProfits: Record<string, number> = {};
    const marketProfits: Record<string, number> = {};

    sortedBets.forEach(bet => {
      const profit = calculateProfit(bet.stake, bet.odds, bet.resultado);
      const dateObj = bet.timestamp?.seconds ? new Date(bet.timestamp.seconds * 1000) : new Date();
      const dateStr = dateObj.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
      
      if (!dailyBalances[dateStr]) dailyBalances[dateStr] = 0;
      dailyBalances[dateStr] += profit;

      // Aggregate for Best League/Market
      if (bet.liga) {
        leagueProfits[bet.liga] = (leagueProfits[bet.liga] || 0) + profit;
      }
      if (bet.mercado) {
        marketProfits[bet.mercado] = (marketProfits[bet.mercado] || 0) + profit;
      }
    });

    Object.keys(dailyBalances).forEach(date => {
      runningBalance += dailyBalances[date];
      chartData.push({ date, balance: runningBalance });
    });

    // Find Best League
    let bestLeague = { name: '-', profit: 0 };
    Object.entries(leagueProfits).forEach(([name, profit]) => {
      if (profit > bestLeague.profit) bestLeague = { name, profit };
    });

    // Find Best Market
    let bestMarket = { name: '-', profit: 0 };
    Object.entries(marketProfits).forEach(([name, profit]) => {
      if (profit > bestMarket.profit) bestMarket = { name, profit };
    });

    // Calculate Detailed League Stats
    const leagueStats = Object.entries(leagueProfits).map(([league, profit]) => {
      const leagueBets = sortedBets.filter(b => b.liga === league);
      const betsCount = leagueBets.length;
      const totalStaked = leagueBets.reduce((acc, b) => acc + b.stake, 0);
      const units = profit / (unitValue || 1);
      const roi = totalStaked > 0 ? (profit / totalStaked) * 100 : 0;
      
      // Calcular greens e reds por liga
      let leagueGreens = 0;
      let leagueReds = 0;
      leagueBets.forEach(bet => {
        const profit = calculateProfit(bet.stake, bet.odds, bet.resultado);
        if (profit > 0) {
          leagueGreens += (bet.resultado === 'meio-green' ? 0.5 : 1);
        } else if (profit < 0) {
          leagueReds += (bet.resultado === 'meio-red' ? 0.5 : 1);
        }
      });
      
      return {
        name: league,
        betsCount,
        profit,
        units,
        roi,
        greens: leagueGreens,
        reds: leagueReds
      };
    }).sort((a, b) => b.units - a.units); // Sort by Units Descending

    return {
      totalGain,
      totalLoss,
      netBalance,
      roi,
      greens,
      reds,
      refunds,
      pending,
      netUnits,
      chartData,
      bestLeague,
      bestMarket,
      leagueStats
    };
  }, [filteredBets, unitValue, initialBankroll]);

  // Calculate Global Bankroll (Unfiltered)
  const globalBankroll = useMemo(() => {
    let balance = initialBankroll;
    let totalProfit = 0;
    const allProfits: number[] = [];
    
    bets.forEach(bet => {
      const profit = calculateProfit(bet.stake, bet.odds, bet.resultado);
      totalProfit += profit;
      balance += profit;
      allProfits.push(profit);
    });
    
    const debugData = {
      initialBankroll,
      totalProfit,
      finalBalance: balance,
      betsCount: bets.length,
      allProfits: allProfits,
      sumCheck: allProfits.reduce((a, b) => a + b, 0)
    };
    
    (window as any).lastDebug = debugData;
    console.log('DEBUG Bankroll:', debugData);
    console.log('Soma manual dos lucros:', allProfits.reduce((a, b) => a + b, 0));
    console.log('Todos os lucros:', allProfits);
    
    return balance;
  }, [bets, initialBankroll]);

  // Group markets by category for selects
  const groupedMarkets = useMemo(() => {
    const groups: Record<string, Market[]> = {};
    marketCategories.forEach(cat => groups[cat.nome] = []);
    if (!groups['OUTROS']) groups['OUTROS'] = [];

    markets.forEach(m => {
      const cat = m.categoria || 'OUTROS';
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(m);
    });
    
    // Ordenar mercados alfabeticamente dentro de cada categoria
    Object.keys(groups).forEach(category => {
      groups[category].sort((a, b) => a.nome.localeCompare(b.nome));
    });
    
    return groups;
  }, [markets, marketCategories]);

  // --- Render Login ---
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-surface border border-slate-800 p-8 rounded-2xl shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-primary to-transparent"></div>
          <div className="flex justify-center mb-6">
            <img src="https://i.ibb.co/G4Y8sHMk/Chat-GPT-Image-21-de-abr-de-2025-16-14-34-1.png" alt="SensorBet Logo" className="h-16 object-contain" />
          </div>
          <p className="text-slate-400 text-center mb-8 font-light">Controle de Apostas</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1">Email de Acesso</label>
              <input 
                id="email-login" 
                type="email" 
                required 
                placeholder="seu@email.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <button type="submit" className="w-full bg-primary hover:bg-[#1aef5c] text-black font-bold py-3 rounded-lg transition-transform active:scale-95 shadow-[0_0_20px_rgba(21,213,78,0.3)]">
              Entrar no Sistema
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- Render App ---
  return (
    <div className="min-h-screen pb-24 sm:pb-12 bg-black">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-black/80 backdrop-blur-lg border-b border-slate-900">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="https://i.ibb.co/G4Y8sHMk/Chat-GPT-Image-21-de-abr-de-2025-16-14-34-1.png" alt="SensorBet Logo" className="h-10 object-contain" />
            
            {/* Bankroll Selector */}
            <div className="relative ml-4">
              <select
                value={activeBankrollId}
                onChange={(e) => setActiveBankrollId(e.target.value)}
                className="bg-slate-900 border border-slate-700 text-white text-sm rounded-lg focus:ring-primary focus:border-primary block w-full p-2.5 pr-8 appearance-none cursor-pointer"
              >
                {bankrolls.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <div className="absolute inset-y-0 right-0 flex items-center px-2 pointer-events-none text-slate-400">
                <ChevronDown size={14} />
              </div>
            </div>
          </div>
          
          <nav className="flex gap-1 bg-slate-900/50 p-1 rounded-lg border border-slate-800 overflow-x-auto">
            <button 
              onClick={() => setActiveTab('dashboard')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${activeTab === 'dashboard' ? 'bg-slate-800 text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <LayoutDashboard size={16} />
              <span className="hidden sm:inline">Dashboard</span>
            </button>
            <button 
              onClick={() => { setActiveTab('new-bet'); cancelEditing(); }}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${activeTab === 'new-bet' ? 'bg-slate-800 text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <Plus size={16} />
              <span className="hidden sm:inline">Aposta</span>
            </button>
            <button 
              onClick={() => setActiveTab('markets')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${activeTab === 'markets' ? 'bg-slate-800 text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <FileText size={16} />
              <span className="hidden sm:inline">Mercados</span>
            </button>
            <button 
              onClick={() => setActiveTab('settings')}
              className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all ${activeTab === 'settings' ? 'bg-slate-800 text-primary shadow-sm' : 'text-slate-400 hover:text-white'}`}
            >
              <Settings size={16} />
              <span className="hidden sm:inline">Config</span>
            </button>
          </nav>

          <button onClick={handleLogout} className="text-xs text-slate-500 hover:text-red-400 transition-colors">
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Dashboard View */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6 animate-in fade-in duration-500">
            
            {/* Top Stats & Filters Bar */}
            <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-surface/30 p-4 rounded-xl border border-slate-800">
               {/* Global Stats */}
               <div className="flex gap-6 w-full md:w-auto justify-between md:justify-start">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Banca Atual</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-xl font-display font-bold ${globalBankroll >= initialBankroll ? 'text-primary' : 'text-red-400'}`}>
                        {formatCurrency(globalBankroll)}
                      </span>
                      {configLoading && <RefreshCw size={12} className="animate-spin text-slate-500"/>}
                    </div>
                  </div>
                  <div className="flex flex-col text-right md:text-left">
                    <span className="text-xs text-slate-400 uppercase font-bold tracking-wider">Valor Unidade</span>
                    <span className="text-lg font-mono text-slate-200">{formatCurrency(unitValue)}</span>
                  </div>
               </div>

               {/* Date Filters */}
               <div className="flex items-center gap-2 w-full md:w-auto bg-slate-900/50 p-2 rounded-lg border border-slate-800">
                  <Calendar size={16} className="text-slate-500 ml-2" />
                  <input 
                    type="date" 
                    value={startDate} 
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent text-sm text-white focus:outline-none w-32 [color-scheme:dark]"
                  />
                  <span className="text-slate-600">-</span>
                  <input 
                    type="date" 
                    value={endDate} 
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent text-sm text-white focus:outline-none w-32 [color-scheme:dark]"
                  />
                  {(startDate || endDate) && (
                    <button 
                      onClick={() => { setStartDate(''); setEndDate(''); }} 
                      className="text-xs text-slate-500 hover:text-white px-2"
                    >
                      Limpar
                    </button>
                  )}
               </div>
            </div>

            {/* Summary Cards (Filtered) */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              <SummaryCard 
                title="Lucro (Período)" 
                value={formatCurrency(stats.netBalance)} 
                type={stats.netBalance >= 0 ? 'gain' : 'loss'}
                subValue={`${stats.roi.toFixed(1)}% ROI (Global)`}
                icon={<Wallet size={20} />}
              />
              <SummaryCard 
                title="Unidades" 
                value={`${stats.netUnits > 0 ? '+' : ''}${stats.netUnits.toFixed(2)}`} 
                type={stats.netUnits >= 0 ? 'gain' : 'loss'}
                subValue="No Período"
                icon={<Coins size={20} />}
              />
              <SummaryCard 
                title="Total de Apostas" 
                value={filteredBets.length.toString()} 
                type="neutral"
                subValue={`${stats.pending} Aguardando`}
                icon={<FileText size={20} />}
              />
              <SummaryCard 
                title="Greens" 
                value={stats.greens.toFixed(1)} 
                type="gain"
                subValue={`${filteredBets.length > 0 ? ((stats.greens / (stats.greens + stats.reds)) * 100).toFixed(1) : 0}% Taxa`}
                icon={<CheckCircle2 size={20} />}
              />
              <SummaryCard 
                title="Reds" 
                value={stats.reds.toFixed(1)} 
                type="loss"
                subValue={`${filteredBets.length > 0 ? ((stats.reds / (stats.greens + stats.reds)) * 100).toFixed(1) : 0}% Taxa`}
                icon={<XCircle size={20} />}
              />
            </div>

            {/* Expandable League Stats Section */}
            <div className="bg-surface border border-slate-800 rounded-xl overflow-hidden transition-all duration-300">
              <button 
                onClick={() => setIsLeagueStatsOpen(!isLeagueStatsOpen)}
                className="w-full flex items-center justify-between p-4 bg-slate-900/50 hover:bg-slate-900 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Trophy size={20} className="text-primary" />
                  <span className="font-display font-bold text-lg text-white">Desempenho por Liga</span>
                </div>
                {isLeagueStatsOpen ? <ChevronUp size={20} className="text-slate-400" /> : <ChevronDown size={20} className="text-slate-400" />}
              </button>

              {isLeagueStatsOpen && (
                <div className="p-4 border-t border-slate-800 animate-in slide-in-from-top-2">
                  {/* Date Filters inside the section as requested */}
                  <div className="flex items-center gap-2 mb-6 bg-black/40 p-3 rounded-lg border border-slate-800 w-fit">
                    <Calendar size={16} className="text-slate-500" />
                    <span className="text-xs text-slate-400 uppercase font-bold mr-2">Período:</span>
                    <input 
                      type="date" 
                      value={startDate} 
                      onChange={(e) => setStartDate(e.target.value)}
                      className="bg-transparent text-sm text-white focus:outline-none w-32 [color-scheme:dark]"
                    />
                    <span className="text-slate-600">-</span>
                    <input 
                      type="date" 
                      value={endDate} 
                      onChange={(e) => setEndDate(e.target.value)}
                      className="bg-transparent text-sm text-white focus:outline-none w-32 [color-scheme:dark]"
                    />
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="text-xs text-slate-500 uppercase border-b border-slate-800">
                          <th className="py-3 px-2 font-medium">Liga</th>
                          <th className="py-3 px-2 font-medium text-center">Apostas</th>
                          <th className="py-3 px-2 font-medium text-center">Greens</th>
                          <th className="py-3 px-2 font-medium text-center">Reds</th>
                          <th className="py-3 px-2 font-medium text-right">Lucro (R$)</th>
                          <th className="py-3 px-2 font-medium text-right">Unidades</th>
                          <th className="py-3 px-2 font-medium text-right">ROI</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.leagueStats.map((league) => (
                          <tr key={league.name} className="border-b border-slate-800/50 hover:bg-white/5 transition-colors">
                            <td className="py-3 px-2 text-sm font-medium text-white">{league.name}</td>
                            <td className="py-3 px-2 text-sm text-slate-400 text-center">{league.betsCount}</td>
                            <td className="py-3 px-2 text-sm text-primary text-center font-medium">{league.greens.toFixed(1)}</td>
                            <td className="py-3 px-2 text-sm text-red-500 text-center font-medium">{league.reds.toFixed(1)}</td>
                            <td className={`py-3 px-2 text-sm font-mono text-right ${league.profit >= 0 ? 'text-primary' : 'text-red-500'}`}>
                              {formatCurrency(league.profit)}
                            </td>
                            <td className={`py-3 px-2 text-sm font-mono text-right ${league.units >= 0 ? 'text-primary' : 'text-red-500'}`}>
                              {league.units > 0 ? '+' : ''}{league.units.toFixed(2)}u
                            </td>
                            <td className={`py-3 px-2 text-sm font-mono text-right ${league.roi >= 0 ? 'text-primary' : 'text-red-500'}`}>
                              {league.roi.toFixed(1)}%
                            </td>
                          </tr>
                        ))}
                        {stats.leagueStats.length === 0 && (
                          <tr>
                            <td colSpan={7} className="py-8 text-center text-slate-500">
                              Nenhuma aposta encontrada neste período.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Chart (Filtered) */}
            <div className="space-y-2">
              <h2 className="text-lg font-display font-bold text-slate-200 pl-1 flex items-center justify-between">
                <span>Desempenho no Período</span>
              </h2>
              <BetChart data={stats.chartData} />
            </div>

            {/* Recent History (Filtered) */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-display font-bold text-slate-200 pl-1 border-l-4 border-primary ml-1 pl-3">
                  Histórico {filteredBets.length > 0 && <span className="text-sm font-normal text-slate-500 ml-2">({filteredBets.length} registros)</span>}
                </h2>
              </div>
              
              {loading ? (
                <div className="text-center py-12 text-slate-500 animate-pulse">
                  <RefreshCw className="animate-spin mx-auto mb-2" />
                  Sincronizando apostas...
                </div>
              ) : filteredBets.length === 0 ? (
                <div className="text-center py-12 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-900/20">
                  {bets.length === 0 ? "Nenhuma aposta registrada." : "Nenhuma aposta encontrada neste período."}
                </div>
              ) : (
                <div className="grid gap-3">
                  {filteredBets.map((bet) => {
                    const profit = calculateProfit(bet.stake, bet.odds, bet.resultado);
                    
                    return (
                      <div key={bet.id} className="group relative bg-surface/60 border border-slate-800 rounded-xl p-4 hover:border-slate-600 transition-all hover:bg-surface flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-bold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">{bet.liga}</span>
                            <span className="text-xs text-slate-500">
                              {bet.timestamp?.seconds ? new Date(bet.timestamp.seconds * 1000).toLocaleDateString() : 'Data N/A'}
                            </span>
                          </div>
                          <div className="font-display font-bold text-lg text-white leading-tight">
                            {bet.jogador1} <span className="text-slate-500 text-sm font-sans mx-1">vs</span> {bet.jogador2}
                          </div>
                          <div className="text-sm text-slate-400 mt-1 flex gap-3 items-center flex-wrap">
                            <span className="flex items-center gap-1"><Target size={14}/> {bet.mercado}</span>
                            <span className="text-slate-600">|</span>
                            <span>Unit: <span className="text-slate-200">{(bet.stake / (unitValue || 100)).toFixed(2)}u</span></span>
                            <span className="text-slate-600">|</span>
                            <span>Odd: <span className="text-primary font-bold">{bet.odds}</span></span>
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-2 w-full sm:w-auto">
                           <div className={`text-xl font-bold font-display ${profit > 0 ? 'text-primary' : profit < 0 ? 'text-danger' : 'text-slate-400'}`}>
                              {profit > 0 ? '+' : ''}{formatCurrency(profit)}
                           </div>
                           
                           {bet.resultado === 'aguardando' ? (
                             <div className="flex flex-wrap justify-end gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                               <button onClick={() => handleUpdateResult(bet.id!, 'green')} title="Green" className="p-1.5 hover:bg-primary/20 text-slate-500 hover:text-primary rounded transition-colors"><CheckCircle2 size={18}/></button>
                               <button onClick={() => handleUpdateResult(bet.id!, 'meio-green')} title="Meio Green" className="p-1.5 hover:bg-primary/20 text-slate-500 hover:text-primary rounded transition-colors text-xs font-bold px-2">½G</button>
                               <button onClick={() => handleUpdateResult(bet.id!, 'red')} title="Red" className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded transition-colors"><XCircle size={18}/></button>
                               <button onClick={() => handleUpdateResult(bet.id!, 'meio-red')} title="Meio Red" className="p-1.5 hover:bg-red-500/20 text-slate-500 hover:text-red-500 rounded transition-colors text-xs font-bold px-2">½R</button>
                               <button onClick={() => handleUpdateResult(bet.id!, 'reembolso')} title="Reembolso" className="p-1.5 hover:bg-blue-500/20 text-slate-500 hover:text-blue-500 rounded transition-colors"><AlertCircle size={18}/></button>
                             </div>
                           ) : (
                             <div className={`text-xs font-bold uppercase px-2 py-1 rounded border ${
                               bet.resultado.includes('green') ? 'border-primary/30 text-primary bg-primary/5' : 
                               bet.resultado.includes('red') ? 'border-red-500/30 text-danger bg-red-500/5' : 
                               'border-blue-500/30 text-blue-400 bg-blue-500/5'
                             }`}>
                               {bet.resultado === 'meio-green' ? '½ Green' : bet.resultado === 'meio-red' ? '½ Red' : bet.resultado}
                             </div>
                           )}
                        </div>
                        
                        {/* Botões de Ação com Z-Index Elevado e StopPropagation Garantido */}
                        <div className="absolute top-2 right-2 flex gap-1 z-50 pointer-events-auto opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              copyBet(bet); 
                            }}
                            className="p-1.5 text-slate-500 hover:text-blue-400 hover:bg-slate-800 rounded-md transition-all"
                            title="Copiar Aposta"
                          >
                            <Copy size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => { 
                              e.preventDefault(); 
                              e.stopPropagation(); 
                              startEditing(bet); 
                            }}
                            className="p-1.5 text-slate-500 hover:text-primary hover:bg-slate-800 rounded-md transition-all"
                            title="Editar Aposta"
                          >
                            <Pencil size={14} />
                          </button>
                          <button 
                            type="button"
                            onClick={(e) => handleDeleteBet(e, bet.id!)}
                            className="p-1.5 text-slate-500 hover:text-red-500 hover:bg-slate-800 rounded-md transition-all"
                            title="Excluir Aposta"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* New Bet Form */}
        {activeTab === 'new-bet' && (
          <div className="max-w-2xl mx-auto animate-in slide-in-from-bottom-4 duration-500">
            <div className="bg-surface border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl relative">
               <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-lime-400 to-primary opacity-50"></div>
               <div className="flex justify-between items-center mb-6">
                 <h2 className="text-2xl font-display font-bold text-white flex items-center gap-2">
                   {editingId ? <Pencil className="text-primary" /> : <Plus className="text-primary" />} 
                   {editingId ? 'Editar Aposta' : 'Nova Aposta'}
                 </h2>
                 {editingId ? (
                   <button onClick={cancelEditing} className="text-xs bg-slate-800 hover:bg-red-500/20 hover:text-red-400 text-slate-400 px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors">
                     <X size={14} /> Cancelar Edição
                   </button>
                 ) : (
                   <button onClick={fetchPlayersFromAPI} className="text-xs text-slate-400 hover:text-primary flex items-center gap-1">
                     <RefreshCw size={12} className={loadingPlayers ? "animate-spin" : ""} /> Atualizar Jogadores
                   </button>
                 )}
               </div>
               
               <form onSubmit={handleBetSubmit} className="space-y-5">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="space-y-2">
                     <label className="text-sm font-medium text-slate-300">Liga / Competição</label>
                     <select 
                        required
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none appearance-none"
                        value={formData.liga}
                        onChange={(e) => setFormData({...formData, liga: e.target.value, jogador1: '', jogador2: ''})}
                     >
                       <option value="">Selecione...</option>
                       <option value="Battle 6 min">Battle 6 min</option>
                       <option value="Battle 8 min">Battle 8 min</option>
                       <option value="Battle 8 min (H2H)">Battle 8 min (H2H)</option>
                       <option value="Adriact 10 min">Adriact 10 min</option>
                       <option value="GT 12 min">GT 12 min</option>
                     </select>
                   </div>
                     <div className="space-y-2 relative">
                       <label className="text-sm font-medium text-slate-300">Mercado</label>
                       
                       {/* Overlay to close dropdown when clicking outside */}
                       {isMarketOptionsOpen && (
                         <div 
                           className="fixed inset-0 z-10" 
                           onClick={() => setIsMarketOptionsOpen(false)}
                         ></div>
                       )}

                       <div className="relative z-20">
                         <input 
                            required
                            type="text"
                            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            placeholder="Selecione ou digite..."
                            value={formData.mercado}
                            onChange={(e) => {
                              setFormData({...formData, mercado: e.target.value});
                              setIsMarketOptionsOpen(true);
                            }}
                            onFocus={() => setIsMarketOptionsOpen(true)}
                         />
                         
                         {/* Chevron Icon to indicate dropdown */}
                         <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500">
                           <ChevronDown size={16} />
                         </div>

                         {/* Custom Dropdown */}
                         {isMarketOptionsOpen && (
                           <div className="absolute top-full left-0 w-full mt-1 bg-slate-900 border border-slate-700 rounded-lg shadow-xl max-h-60 overflow-y-auto z-50 custom-scrollbar">
                             {marketCategories.map(category => {
                               const categoryMarkets = groupedMarkets[category.nome];
                               if (!categoryMarkets || categoryMarkets.length === 0) return null;
                               
                               // Filter markets based on input AND visibility
                               const filteredMarkets = categoryMarkets.filter(m => 
                                 !m.hidden && m.nome.toLowerCase().includes(formData.mercado.toLowerCase())
                               );

                               if (filteredMarkets.length === 0) return null;

                               return (
                                 <div key={category.id}>
                                   <div className="px-3 py-2 bg-slate-800/50 text-xs font-bold text-primary uppercase tracking-wider sticky top-0 backdrop-blur-sm">
                                     {category.nome}
                                   </div>
                                   {filteredMarkets.map(m => (
                                     <button
                                       key={m.id}
                                       type="button"
                                       className="w-full text-left px-4 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                                       onClick={() => {
                                         setFormData({...formData, mercado: m.nome});
                                         setIsMarketOptionsOpen(false);
                                       }}
                                     >
                                       {m.nome}
                                     </button>
                                   ))}
                                 </div>
                               );
                             })}
                             
                             {/* Show "Create new" option if no matches found (optional, but good UX) */}
                             {formData.mercado && !markets.some(m => m.nome.toLowerCase() === formData.mercado.toLowerCase()) && (
                               <div className="p-2 text-center border-t border-slate-800">
                                 <span className="text-xs text-slate-500">Novo mercado: </span>
                                 <span className="text-sm text-white font-bold">"{formData.mercado}"</span>
                               </div>
                             )}
                           </div>
                         )}
                       </div>
                     </div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">Jogador 1 (Casa)</label>
                      <input 
                        required
                        list="players-list"
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                        placeholder="Nome ou selecione"
                        value={formData.jogador1}
                        onChange={(e) => setFormData({...formData, jogador1: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">Jogador 2 (Fora)</label>
                      <input 
                        required
                        list="players-list"
                        type="text" 
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                        placeholder="Nome ou selecione"
                        value={formData.jogador2}
                        onChange={(e) => setFormData({...formData, jogador2: e.target.value})}
                      />
                    </div>
                    {/* Datalist for Players - Filtered by selected league if available */}
                    <datalist id="players-list">
                      {formData.liga && playersCache[formData.liga] 
                        ? Array.from(playersCache[formData.liga]).sort().map(player => (
                            <option key={player} value={player} />
                          ))
                        : null
                      }
                    </datalist>
                 </div>

                 <div className="grid grid-cols-2 gap-5">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300 flex justify-between">
                        <span>Stake (R$)</span>
                        {formData.stake && unitValue && (
                          <span className="text-xs text-primary font-mono bg-primary/10 px-2 rounded border border-primary/20">
                            {(parseFloat(formData.stake) / unitValue).toFixed(2)}u
                          </span>
                        )}
                      </label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none font-mono"
                        placeholder="0.00"
                        value={formData.stake}
                        onChange={(e) => setFormData({...formData, stake: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-slate-300">Odds</label>
                      <input 
                        required
                        type="number" 
                        step="0.01"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none font-mono"
                        placeholder="1.90"
                        value={formData.odds}
                        onChange={(e) => setFormData({...formData, odds: e.target.value})}
                      />
                    </div>
                 </div>

                 <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300">Status Inicial</label>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'aguardando'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'aguardando' ? 'bg-blue-500 text-white border-blue-500' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        Aguardando
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'green'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'green' ? 'bg-primary text-black border-primary' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        Green
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'meio-green'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'meio-green' ? 'bg-emerald-800 text-white border-emerald-500' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        ½ Green
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'red'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'red' ? 'bg-red-600 text-white border-red-500' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        Red
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'meio-red'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'meio-red' ? 'bg-red-900/50 text-white border-red-500' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        ½ Red
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormData({...formData, resultado: 'reembolso'})}
                        className={`py-2 px-1 rounded-lg border text-xs font-bold uppercase transition-all ${formData.resultado === 'reembolso' ? 'bg-blue-800 text-white border-blue-600' : 'bg-slate-900 border-slate-700 text-slate-400'}`}
                      >
                        Reembolso
                      </button>
                    </div>
                 </div>

                 {/* Live Potential Calc */}
                 {formData.stake && formData.odds && (
                   <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-800 flex justify-between items-center mt-4">
                      <span className="text-slate-400 text-sm">Retorno Potencial</span>
                      <span className="text-primary font-display font-bold text-xl">
                        {formatCurrency(parseFloat(formData.stake.toString()) * parseFloat(formData.odds.toString()))}
                      </span>
                   </div>
                 )}

                 <button type="submit" className="w-full bg-primary hover:bg-[#1aef5c] text-black font-bold py-4 rounded-xl text-lg transition-transform active:scale-[0.98] shadow-[0_0_20px_rgba(21,213,78,0.4)] mt-4">
                   {editingId ? 'Atualizar Aposta' : 'Confirmar Aposta'}
                 </button>
               </form>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="max-w-xl mx-auto animate-in fade-in duration-500">
             <div className="bg-surface border border-slate-800 rounded-2xl p-6 sm:p-8 shadow-xl">
                <h2 className="text-2xl font-display font-bold text-white mb-6 flex items-center gap-2">
                   <Settings className="text-primary" /> Configurações da Banca
                </h2>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Wallet size={16} /> Banca Inicial (R$)
                      {configLoading && <RefreshCw size={12} className="animate-spin text-slate-500"/>}
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none text-lg font-mono"
                      value={localInitialBankroll}
                      onChange={(e) => setLocalInitialBankroll(parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-slate-500">O valor com o qual você começou suas operações.</p>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Coins size={16} /> Valor da Unidade (R$)
                    </label>
                    <input 
                      type="number" 
                      step="0.01"
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none text-lg font-mono"
                      value={localUnitValue}
                      onChange={(e) => setLocalUnitValue(parseFloat(e.target.value))}
                    />
                    <p className="text-xs text-slate-500">
                       Usado para calcular seus resultados em unidades. Ex: Se a unidade é R$ 100, uma aposta de R$ 250 será contabilizada como 2.5u.
                    </p>
                  </div>

                  <div className="pt-4 border-t border-slate-800">
                    <button 
                      onClick={() => handleUpdateBankroll(activeBankrollId, { initialCapital: localInitialBankroll, unitValue: localUnitValue })}
                      className="w-full flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-primary border border-slate-700 px-6 py-3 rounded-xl font-bold transition-colors"
                    >
                      <Save size={18} /> Salvar Configurações ({activeBankroll?.name})
                    </button>
                    <p className="text-center text-xs text-slate-600 mt-2">
                      Configurações aplicadas apenas à banca atual.
                    </p>
                  </div>

                  {/* Create New Bankroll Section */}
                  <div className="pt-8 mt-8 border-t border-slate-800">
                    <h3 className="text-lg font-bold text-white mb-4">Criar Nova Banca</h3>
                    <form 
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = e.target as HTMLFormElement;
                        const name = (form.elements.namedItem('newBankrollName') as HTMLInputElement).value;
                        const initial = parseFloat((form.elements.namedItem('newBankrollInitial') as HTMLInputElement).value);
                        const unit = parseFloat((form.elements.namedItem('newBankrollUnit') as HTMLInputElement).value);
                        if (name && initial && unit) {
                          handleCreateBankroll(name, initial, unit);
                          form.reset();
                        }
                      }}
                      className="space-y-4"
                    >
                      <div>
                        <label className="text-sm font-medium text-slate-300">Nome da Banca (ex: Live, VIP)</label>
                        <input name="newBankrollName" required type="text" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-primary outline-none" />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-sm font-medium text-slate-300">Banca Inicial</label>
                          <input name="newBankrollInitial" required type="number" step="0.01" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-primary outline-none" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-slate-300">Valor Unidade</label>
                          <input name="newBankrollUnit" required type="number" step="0.01" className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 text-white focus:border-primary outline-none" />
                        </div>
                      </div>
                      <button type="submit" className="w-full bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 px-6 py-2 rounded-lg font-bold transition-colors">
                        Criar Banca
                      </button>
                    </form>
                  </div>
                </div>
             </div>
          </div>
        )}

        {/* Markets View */}
        {activeTab === 'markets' && (
           <div className="max-w-2xl mx-auto animate-in fade-in duration-500">
             <div className="bg-surface border border-slate-800 rounded-2xl p-6 shadow-xl">
                <h2 className="text-xl font-display font-bold text-white mb-6 flex items-center gap-2">
                 <FileText className="text-slate-400" /> Gerenciar Mercados
                </h2>

                {/* Add Category Form */}
                <form onSubmit={handleAddCategory} className="mb-8 p-4 bg-slate-900/30 rounded-xl border border-slate-800 flex gap-2">
                  <input 
                    type="text" 
                    required
                    placeholder="Nome da nova categoria..."
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-primary border border-slate-700 px-6 py-3 rounded-lg font-bold transition-colors whitespace-nowrap">
                    Criar Categoria
                  </button>
                </form>

                <form onSubmit={handleAddMarket} className="flex flex-col sm:flex-row gap-2 mb-8">
                  <select
                    className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                    value={newMarketCategory}
                    onChange={(e) => setNewMarketCategory(e.target.value)}
                  >
                    {marketCategories.map(cat => (
                      <option key={cat.id} value={cat.nome}>{cat.nome}</option>
                    ))}
                  </select>
                  <input 
                    type="text" 
                    required
                    placeholder="Nome do novo mercado (ex: Over 2.5)"
                    className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-4 py-3 text-white focus:border-primary outline-none"
                    value={newMarketName}
                    onChange={(e) => setNewMarketName(e.target.value)}
                  />
                  <button type="submit" className="bg-slate-800 hover:bg-slate-700 text-primary border border-slate-700 px-6 py-3 rounded-lg font-bold transition-colors">
                    Adicionar
                  </button>
                </form>

                {/* Category Reordering Section */}
                <div className="mb-8 p-4 bg-slate-900/30 rounded-xl border border-slate-800">
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Organizar Categorias</h3>
                  <div className="space-y-2">
                    {marketCategories.map((cat, index) => (
                      <div key={cat.id} className="flex items-center justify-between bg-slate-900/80 p-3 rounded-lg border border-slate-800">
                        <span className="text-white font-medium">{cat.nome}</span>
                        <div className="flex gap-1">
                          <button 
                            onClick={() => handleMoveCategory(index, 'up')}
                            disabled={index === 0}
                            className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${index === 0 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white'}`}
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button 
                            onClick={() => handleMoveCategory(index, 'down')}
                            disabled={index === marketCategories.length - 1}
                            className={`p-1.5 rounded hover:bg-slate-700 transition-colors ${index === marketCategories.length - 1 ? 'text-slate-600 cursor-not-allowed' : 'text-slate-400 hover:text-white'}`}
                          >
                            <ArrowDown size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {marketCategories.map(category => {
                    const categoryMarkets = groupedMarkets[category.nome];
                    if (!categoryMarkets || categoryMarkets.length === 0) return null;

                    return (
                      <div key={category.id} className="space-y-2">
                        <h3 className="text-xs font-bold text-primary uppercase tracking-wider pl-1">{category.nome}</h3>
                        {categoryMarkets.map((market) => (
                          <div key={market.id} className={`flex justify-between items-center p-3 bg-slate-900/50 border border-slate-800 rounded-lg group hover:border-slate-600 transition-colors ${market.hidden ? 'opacity-50' : ''}`}>
                            <div className="flex items-center gap-2">
                              <span className={`font-medium ${market.hidden ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{market.nome}</span>
                              {market.hidden && <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded uppercase">Oculto</span>}
                            </div>
                            
                            <div className="flex gap-1">
                              <button 
                                onClick={(e) => handleToggleMarketVisibility(e, market)}
                                className="text-slate-500 hover:text-white p-2 rounded transition-colors bg-slate-900/80 border border-slate-800 hover:bg-slate-800 cursor-pointer"
                                title={market.hidden ? "Mostrar Mercado" : "Ocultar Mercado"}
                              >
                                {market.hidden ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                              
                              {(market.userEmail === userEmail || localStorage.getItem('currentUserKey') === 'admin') && (
                                <button 
                                  onClick={(e) => handleDeleteMarket(e, market.id!)}
                                  className="text-slate-500 hover:text-red-500 p-2 rounded transition-colors bg-slate-900/80 border border-slate-800 hover:bg-slate-800 cursor-pointer"
                                  title="Excluir Mercado"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                  {markets.length === 0 && <p className="text-slate-500 text-center py-4">Nenhum mercado personalizado.</p>}
                </div>
             </div>
           </div>
        )}

      </main>
    </div>
  );
}