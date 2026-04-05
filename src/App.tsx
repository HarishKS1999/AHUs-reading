import React, { useState, useEffect, useMemo, Component } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  doc,
  getDocs,
  writeBatch,
  deleteDoc,
  updateDoc,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { 
  LayoutDashboard, 
  PlusCircle, 
  LogOut, 
  Building2, 
  History,
  AlertCircle,
  Zap,
  Calendar,
  ChevronRight,
  Save,
  CheckCircle2,
  Settings,
  Trash2,
  BarChart3,
  Menu,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Thermometer,
  Droplets,
  Sun,
  Moon,
  Palette,
  Monitor,
  FileDown,
  ShieldAlert,
  Flame,
  Clock,
  Bell,
  BellOff,
  TrendingUp,
  PieChart as PieChartIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  LineChart,
  Line,
  PieChart,
  Pie,
  AreaChart,
  Area
} from 'recharts';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { db, auth } from './firebase';
import { cn } from './lib/utils';

// --- Types ---
interface Equipment {
  id?: string;
  floorNumber: number;
  equipmentType: 'AHU' | 'Pantry';
  ahuNumber?: number;
  wing?: 'A' | 'B';
  userId: string;
}

interface Reading {
  id?: string;
  floorNumber: number;
  equipmentType: 'AHU' | 'Pantry';
  ahuNumber?: number;
  wing?: 'A' | 'B';
  initialValue: number;
  finalValue: number;
  consumption: number;
  timestamp: string; // ISO string
  userId: string;
}

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

// --- Error Handling ---
class ErrorBoundary extends Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-surface-950">
          <div className="glass-panel p-8 rounded-3xl max-w-md border-danger/20">
            <div className="w-16 h-16 bg-danger/10 rounded-2xl flex items-center justify-center mb-6 mx-auto">
              <AlertCircle className="w-8 h-8 text-danger" />
            </div>
            <h1 className="text-xl font-bold text-surface-50 mb-2">System Error</h1>
            <p className="text-surface-400 text-sm mb-8">
              {state.error?.message || "An unexpected error occurred in the monitoring system."}
            </p>
            <button 
              onClick={() => window.location.reload()} 
              className="w-full py-3 bg-surface-100 text-surface-950 font-bold rounded-xl hover:bg-surface-100 transition-colors"
            >
              Restart System
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// --- App Wrapper ---
export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  );
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [readings, setReadings] = useState<Reading[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'audit' | 'history' | 'settings' | 'monitor'>('dashboard');
  const [selectedFloor, setSelectedFloor] = useState<number>(() => {
    const saved = localStorage.getItem('ahu_selected_floor');
    return saved ? parseInt(saved) : 4;
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [uiSize, setUiSize] = useState<number>(() => {
    const saved = localStorage.getItem('ahu_ui_size');
    return saved ? parseInt(saved) : 16;
  });

  const [themeMode, setThemeMode] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('ahu_theme_mode') as 'light' | 'dark') || 'dark';
  });
  const [themeColor, setThemeColor] = useState<'indigo' | 'emerald' | 'rose' | 'amber' | 'violet'>(() => {
    return (localStorage.getItem('ahu_theme_color') as any) || 'indigo';
  });

  // Apply and Persist UI Size
  useEffect(() => {
    document.documentElement.style.setProperty('--base-font-size', `${uiSize}px`);
    localStorage.setItem('ahu_ui_size', uiSize.toString());
  }, [uiSize]);

  // Update Android Theme Color
  useEffect(() => {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const color = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', color);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = color;
      document.head.appendChild(meta);
    }
  }, [themeColor, themeMode]);

  // Apply Theme
  useEffect(() => {
    document.documentElement.setAttribute('data-mode', themeMode);
    localStorage.setItem('ahu_theme_mode', themeMode);
  }, [themeMode]);

  useEffect(() => {
    document.documentElement.setAttribute('data-color', themeColor);
    localStorage.setItem('ahu_theme_color', themeColor);
  }, [themeColor]);

  // Persist Selected Floor
  useEffect(() => {
    localStorage.setItem('ahu_selected_floor', selectedFloor.toString());
  }, [selectedFloor]);

  // Live Input State
  const [liveInputs, setLiveInputs] = useState<Record<string, { initial: string, final: string }>>({});

  // --- Auth ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const userRef = doc(db, 'users', result.user.uid);
      await setDoc(userRef, { email: result.user.email, role: 'Viewer' }, { merge: true });
    } catch (err) {
      setError("Authentication failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {}
  };

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: newRole });
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (err) {
      console.error("Error updating role:", err);
    }
  };

  // --- Data Initialization ---
  useEffect(() => {
    if (!isAuthReady || !user) return;

    let unsubscribeEquip: () => void = () => {};
    let unsubscribeReadings: () => void = () => {};

    const initializeData = async () => {
      try {
        const equipQuery = query(collection(db, 'equipment'));
        const equipSnapshot = await getDocs(equipQuery);
        const existingEquip = equipSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Equipment));
        
        const batch = writeBatch(db);
        const floors = [4, 5, 6, 7];
        let needsCommit = false;
        const seen = new Set<string>();

        existingEquip.forEach(e => {
          const key = e.equipmentType === 'AHU' ? `F${e.floorNumber}-AHU-${e.ahuNumber}` : `F${e.floorNumber}-Pantry-${e.wing}`;
          if (seen.has(key)) {
            if (e.id) batch.delete(doc(db, 'equipment', e.id));
            needsCommit = true;
          } else {
            seen.add(key);
          }
        });

        floors.forEach(f => {
          [1, 2, 3, 4].forEach(a => {
            const key = `F${f}-AHU-${a}`;
            if (!seen.has(key)) {
              const ref = doc(collection(db, 'equipment'));
              batch.set(ref, { floorNumber: f, equipmentType: 'AHU', ahuNumber: a, userId: user.uid });
              seen.add(key);
              needsCommit = true;
            }
          });
          if (f === 4) {
            ['A', 'B'].forEach(w => {
              const key = `F${f}-Pantry-${w}`;
              if (!seen.has(key)) {
                const ref = doc(collection(db, 'equipment'));
                batch.set(ref, { floorNumber: f, equipmentType: 'Pantry', wing: w, userId: user.uid });
                seen.add(key);
                needsCommit = true;
              }
            });
          }
        });

        if (needsCommit) await batch.commit();

        unsubscribeEquip = onSnapshot(equipQuery, (snapshot) => {
          setEquipment(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Equipment[]);
        });

        const q = query(collection(db, 'readings'), orderBy('timestamp', 'desc'));
        unsubscribeReadings = onSnapshot(q, (snapshot) => {
          setReadings(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Reading[]);
        });

        const currentUserDoc = await getDoc(doc(db, 'users', user.uid));
        const currentUserRole = currentUserDoc.exists() ? currentUserDoc.data().role : 'Viewer';
        const isDefaultAdmin = user.email === 'ksharish1999@gmail.com' && user.emailVerified;

        if (currentUserRole === 'Admin' || isDefaultAdmin) {
          try {
            const usersSnapshot = await getDocs(collection(db, 'users'));
            setUsers(usersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
          } catch (userErr) {
            console.error("Failed to fetch users list:", userErr);
          }
        }

      } catch (err) {
        console.error("Data sync error:", err);
        setError(`Failed to sync with database: ${err instanceof Error ? err.message : String(err)}`);
      }
    };

    initializeData();
    return () => {
      unsubscribeEquip();
      unsubscribeReadings();
    };
  }, [isAuthReady, user]);

  // --- Calculations ---
  const dailyTotal = useMemo(() => {
    return readings
      .filter(r => r.timestamp.startsWith(selectedDate) && (r.equipmentType === 'AHU' || !r.equipmentType))
      .reduce((sum, r) => sum + r.consumption, 0);
  }, [readings, selectedDate]);

  const previousDayTotal = useMemo(() => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    const prevDate = d.toISOString().split('T')[0];
    return readings
      .filter(r => r.timestamp.startsWith(prevDate) && (r.equipmentType === 'AHU' || !r.equipmentType))
      .reduce((sum, r) => sum + r.consumption, 0);
  }, [readings, selectedDate]);

  const monthlyTotal = useMemo(() => {
    const [year, month] = selectedDate.split('-');
    const prefix = `${year}-${month}`;
    return readings
      .filter(r => r.timestamp.startsWith(prefix) && (r.equipmentType === 'AHU' || !r.equipmentType))
      .reduce((sum, r) => sum + r.consumption, 0);
  }, [readings, selectedDate]);

  const floorMetrics = useMemo(() => {
    const total = dailyTotal || 1;
    return [4, 5, 6, 7].map(f => {
      const ahu = readings
        .filter(r => r.floorNumber === f && r.timestamp.startsWith(selectedDate) && (r.equipmentType === 'AHU' || !r.equipmentType))
        .reduce((sum, r) => sum + r.consumption, 0);
      const pantry = readings
        .filter(r => r.floorNumber === f && r.timestamp.startsWith(selectedDate) && r.equipmentType === 'Pantry')
        .reduce((sum, r) => sum + r.consumption, 0);
      return { 
        floor: f, 
        ahu, 
        pantry,
        percentage: (ahu / total) * 100
      };
    });
  }, [readings, selectedDate, dailyTotal]);

  const auditProgress = useMemo(() => {
    const floorEquip = equipment.filter(e => e.floorNumber === selectedFloor);
    const completed = floorEquip.filter(equip => {
      return readings.some(r => 
        r.floorNumber === selectedFloor && 
        (r.equipmentType || 'AHU') === equip.equipmentType &&
        r.timestamp.startsWith(selectedDate) &&
        (equip.equipmentType === 'AHU' ? r.ahuNumber === equip.ahuNumber : r.wing === equip.wing)
      );
    }).length;
    return {
      completed,
      total: floorEquip.length,
      percentage: floorEquip.length > 0 ? (completed / floorEquip.length) * 100 : 0
    };
  }, [equipment, readings, selectedFloor, selectedDate]);

  const chartData = useMemo(() => {
    const history: Record<string, number> = {};
    readings.forEach(r => {
      if (r.equipmentType === 'AHU' || !r.equipmentType) {
        const date = r.timestamp.split('T')[0];
        history[date] = (history[date] || 0) + r.consumption;
      }
    });
    return Object.entries(history)
      .map(([date, total]) => ({ date, total }))
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-14); // Last 14 days for trend
  }, [readings]);

  const anomalies = useMemo(() => {
    if (readings.length < 5) return [];
    const ahuReadings = readings.filter(r => r.equipmentType === 'AHU' || !r.equipmentType);
    const avg = ahuReadings.reduce((sum, r) => sum + r.consumption, 0) / ahuReadings.length;
    const stdDev = Math.sqrt(ahuReadings.reduce((sum, r) => sum + Math.pow(r.consumption - avg, 2), 0) / ahuReadings.length);
    const threshold = avg + stdDev * 1.5;
    
    return readings.filter(r => r.consumption > threshold && r.timestamp.startsWith(selectedDate));
  }, [readings, selectedDate]);

  const heatmapData = useMemo(() => {
    const maxConsumption = Math.max(...floorMetrics.map(f => f.ahu), 1);
    return floorMetrics.map(f => ({
      ...f,
      intensity: f.ahu / maxConsumption
    }));
  }, [floorMetrics]);

  // --- Utility Handlers ---
  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {
        setSuccess("Notifications enabled.");
        setTimeout(() => setSuccess(null), 3000);
      }
    }
  };

  const sendNotification = (title: string, body: string) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body, icon: '/favicon.ico' });
    }
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    const tableData = readings
      .filter(r => r.timestamp.startsWith(selectedDate))
      .map(r => [
        new Date(r.timestamp).toLocaleTimeString(),
        `Floor ${r.floorNumber}`,
        r.equipmentType === 'AHU' ? `AHU ${r.ahuNumber}` : `Pantry ${r.wing}`,
        r.initialValue.toFixed(2),
        r.finalValue.toFixed(2),
        r.consumption.toFixed(r.equipmentType === 'AHU' ? 2 : 3)
      ]);

    doc.setFontSize(18);
    doc.text(`Energy Audit Report - ${selectedDate}`, 14, 20);
    doc.setFontSize(12);
    doc.text(`Total Consumption: ${dailyTotal.toFixed(2)} MWh`, 14, 30);

    autoTable(doc, {
      startY: 40,
      head: [['Time', 'Floor', 'Unit', 'Initial', 'Final', 'Consumption (MWh)']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [99, 102, 241] }
    });

    doc.save(`Energy_Audit_${selectedDate}.pdf`);
  };

  // --- Reading Handlers ---
  useEffect(() => {
    if (!isAuthReady || !user) return;
    const newInputs: Record<string, { initial: string, final: string }> = {};
    const floorEquip = equipment.filter(e => e.floorNumber === selectedFloor);
    
    floorEquip.forEach(equip => {
      const key = equip.equipmentType === 'AHU' ? `AHU-${equip.ahuNumber}` : `Pantry-${equip.wing}`;
      const existing = readings.find(r => 
        r.floorNumber === selectedFloor && 
        (r.equipmentType || 'AHU') === equip.equipmentType &&
        r.timestamp.startsWith(selectedDate) &&
        (equip.equipmentType === 'AHU' ? r.ahuNumber === equip.ahuNumber : r.wing === equip.wing)
      );

      if (existing) {
        newInputs[key] = { initial: existing.initialValue.toString(), final: existing.finalValue.toString() };
      } else {
        const latest = readings
          .filter(r => 
            r.floorNumber === selectedFloor && 
            (r.equipmentType || 'AHU') === equip.equipmentType &&
            r.timestamp.split('T')[0] < selectedDate &&
            (equip.equipmentType === 'AHU' ? r.ahuNumber === equip.ahuNumber : r.wing === equip.wing)
          )
          .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
        newInputs[key] = { initial: latest ? latest.finalValue.toString() : '', final: '' };
      }
    });
    setLiveInputs(newInputs);
  }, [selectedFloor, selectedDate, readings, equipment, isAuthReady, user]);

  const handleInputChange = (key: string, field: 'initial' | 'final', value: string) => {
    setLiveInputs(prev => ({
      ...prev,
      [key]: { ...(prev[key] || { initial: '', final: '' }), [field]: value }
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const batch = writeBatch(db);
      const now = new Date();
      const timestamp = new Date(`${selectedDate}T${now.toISOString().split('T')[1]}`).toISOString();
      let count = 0;

      for (const [key, input] of Object.entries(liveInputs) as [string, { initial: string, final: string }][]) {
        const initial = parseFloat(input.initial);
        const final = parseFloat(input.final);
        if (!isNaN(initial) && !isNaN(final)) {
          if (final < initial) throw new Error(`Invalid reading for ${key}: Final < Initial`);
          
          const [type, val] = key.split('-');
          const existing = readings.find(r => 
            r.floorNumber === selectedFloor && 
            (r.equipmentType || 'AHU') === type &&
            r.timestamp.startsWith(selectedDate) &&
            (type === 'AHU' ? r.ahuNumber === parseInt(val) : r.wing === val)
          );

          const ref = existing?.id ? doc(db, 'readings', existing.id) : doc(collection(db, 'readings'));
          const readingData: any = {
            floorNumber: selectedFloor,
            equipmentType: type as 'AHU' | 'Pantry',
            initialValue: initial,
            finalValue: final,
            consumption: Number((final - initial).toFixed(4)),
            timestamp: existing?.timestamp || timestamp,
            userId: user.uid,
          };

          if (type === 'AHU') {
            readingData.ahuNumber = parseInt(val);
          } else {
            readingData.wing = val;
          }

          batch.set(ref, readingData, { merge: true });
          count++;
        }
      }
      if (count === 0) throw new Error("No data to save.");
      await batch.commit();
      sendNotification("Audit Saved", `Successfully recorded ${count} readings for Floor ${selectedFloor}.`);
      setSuccess("Readings synchronized successfully.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
      setTimeout(() => setError(null), 4000);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this reading?")) return;
    try {
      await deleteDoc(doc(db, 'readings', id));
      setSuccess("Reading removed.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError("Delete failed.");
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-surface-950">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }} 
          animate={{ opacity: 1, scale: 1 }} 
          className="glass-panel p-12 rounded-[3rem] text-center max-w-md w-full"
        >
          <div className="w-24 h-24 bg-primary/20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-[0_0_40px_rgba(99,102,241,0.3)]">
            <Activity className="w-12 h-12 text-primary animate-pulse-subtle" />
          </div>
          <h1 className="text-4xl font-black text-surface-50 tracking-tighter mb-2 uppercase">AHU Reading</h1>
          <p className="text-surface-400 font-medium mb-12 tracking-wide">INDUSTRIAL ENERGY AUDIT SYSTEM</p>
          <button 
            onClick={handleLogin} 
            className="w-full py-5 bg-primary text-white font-black rounded-2xl hover:bg-primary-dark transition-all shadow-xl shadow-primary/20 flex items-center justify-center gap-3"
          >
            <Zap className="w-5 h-5" />
            INITIALIZE SESSION
          </button>
        </motion.div>
      </div>
    );
  }

  const Header = () => (
    <header className="fixed top-0 left-0 right-0 z-50 glass-panel border-b border-surface-100/5 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button 
          onClick={() => setIsSidebarOpen(true)}
          className="p-2 hover:bg-surface-100/5 rounded-xl transition-colors"
        >
          <Menu className="w-6 h-6 text-primary" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-primary/20 rounded-lg flex items-center justify-center">
            <Activity className="w-5 h-5 text-primary" />
          </div>
          <span className="font-black tracking-tighter uppercase text-sm hidden sm:inline">AHU Audit</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end mr-2">
          <span className="text-[10px] font-black uppercase text-surface-500 leading-none">Operator</span>
          <span className="text-xs font-bold text-surface-50 leading-none mt-1">{user?.displayName?.split(' ')[0]}</span>
        </div>
        {user?.photoURL && (
          <img src={user.photoURL} alt="User" className="w-8 h-8 rounded-full border border-surface-100/10" referrerPolicy="no-referrer" />
        )}
      </div>
    </header>
  );

  const Sidebar = () => (
    <AnimatePresence>
      {isSidebarOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]"
          />
          <motion.div 
            initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 left-0 bottom-0 w-[280px] glass-panel z-[70] p-8 flex flex-col"
          >
            <div className="flex items-center justify-between mb-12">
              <div className="flex items-center gap-2">
                <Activity className="w-6 h-6 text-primary" />
                <span className="font-black tracking-tighter uppercase text-lg">AHU AUDIT</span>
              </div>
              <button onClick={() => setIsSidebarOpen(false)} className="p-2 hover:bg-surface-100/5 rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-8 flex-1 overflow-y-auto pr-2">
              <div>
                <span className="technical-label mb-4 block">Floor Navigation</span>
                <div className="grid grid-cols-2 gap-3">
                  {[4, 5, 6, 7].map(f => (
                    <button 
                      key={f} 
                      onClick={() => {
                        setSelectedFloor(f);
                        setIsSidebarOpen(false);
                        setActiveTab('audit');
                      }}
                      className={cn(
                        "py-4 rounded-2xl font-black transition-all border",
                        selectedFloor === f 
                          ? "bg-primary/20 border-primary/40 text-surface-50 shadow-[0_0_15px_var(--primary-glow)]" 
                          : "bg-surface-900/50 border-surface-100/5 text-surface-400 hover:text-surface-50"
                      )}
                    >
                      FLOOR {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <span className="technical-label mb-4 block">Quick Access</span>
                <button 
                  onClick={() => { setActiveTab('dashboard'); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl transition-all",
                    activeTab === 'dashboard' ? "bg-primary/10 text-primary" : "hover:bg-surface-100/5 text-surface-300 hover:text-surface-50"
                  )}
                >
                  <LayoutDashboard className="w-5 h-5" />
                  <span className="font-bold">Dashboard</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('monitor'); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl transition-all",
                    activeTab === 'monitor' ? "bg-primary/10 text-primary" : "hover:bg-surface-100/5 text-surface-300 hover:text-surface-50"
                  )}
                >
                  <Monitor className="w-5 h-5" />
                  <span className="font-bold">Live Monitor</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('history'); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl transition-all",
                    activeTab === 'history' ? "bg-primary/10 text-primary" : "hover:bg-surface-100/5 text-surface-300 hover:text-surface-50"
                  )}
                >
                  <History className="w-5 h-5" />
                  <span className="font-bold">Audit History</span>
                </button>
                <button 
                  onClick={() => { setActiveTab('settings'); setIsSidebarOpen(false); }}
                  className={cn(
                    "w-full flex items-center gap-3 p-4 rounded-2xl transition-all",
                    activeTab === 'settings' ? "bg-primary/10 text-primary" : "hover:bg-surface-100/5 text-surface-300 hover:text-surface-50"
                  )}
                >
                  <Settings className="w-5 h-5" />
                  <span className="font-bold">Configuration</span>
                </button>
              </div>
            </div>

            <div className="pt-8 border-t border-surface-100/5">
              <button 
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-4 rounded-2xl hover:bg-danger/10 transition-all text-danger"
              >
                <LogOut className="w-5 h-5" />
                <span className="font-bold uppercase tracking-tighter">Terminate Session</span>
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );

  const NavItem = ({ id, icon: Icon, label }: { id: typeof activeTab, icon: any, label: string }) => (
    <button 
      onClick={() => setActiveTab(id)}
      className={cn(
        "flex flex-col items-center justify-center gap-1 p-3 rounded-xl transition-all duration-200 flex-1",
        activeTab === id ? "text-primary" : "text-surface-500 hover:text-surface-300"
      )}
    >
      <Icon className="w-6 h-6" />
      <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
    </button>
  );

  return (
    <div className={cn("min-h-screen pb-24 text-surface-100 pt-20", themeMode)}>
      <Header />
      <Sidebar />
      {/* Main Content */}
      <main className="p-4 lg:p-12 max-w-7xl mx-auto w-full">
        <AnimatePresence mode="wait">
          {/* ... (keep existing view logic) ... */}
          {/* Dashboard View */}
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <span className="technical-label">System Overview</span>
                  <h1 className="text-4xl font-black tracking-tighter uppercase mt-1">Operational Status</h1>
                </div>
                <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-2xl">
                  <Calendar className="w-5 h-5 text-primary" />
                  <input 
                    type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-surface-50 outline-none cursor-pointer"
                  />
                </div>
              </header>

              {/* Bento Grid Metrics */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-2 glass-card p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[240px] relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-12 opacity-5 group-hover:opacity-10 transition-opacity">
                    <Zap className="w-48 h-48 text-primary" />
                  </div>
                  <div>
                    <span className="technical-label">Total Consumption (AHU)</span>
                    <div className="flex flex-col mt-2">
                      <div className="flex items-baseline gap-3">
                        <span className="text-7xl font-black tracking-tighter data-value">{dailyTotal.toFixed(2)}</span>
                        <span className="text-xl font-bold text-surface-500">MWh</span>
                      </div>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold text-accent data-value">{(dailyTotal * 1000).toLocaleString()}</span>
                          <span className="text-sm font-bold text-surface-500">kWh</span>
                        </div>
                        {dailyTotal > 0 && previousDayTotal > 0 && (
                          <div className={cn(
                            "flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest",
                            dailyTotal > previousDayTotal ? "bg-danger/10 text-danger" : "bg-accent/10 text-accent"
                          )}>
                            {dailyTotal > previousDayTotal ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {Math.abs(((dailyTotal - previousDayTotal) / previousDayTotal) * 100).toFixed(1)}% VS PREV
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 text-accent">
                      <ArrowUpRight className="w-5 h-5" />
                      <span className="text-sm font-bold">System Active</span>
                    </div>
                    {anomalies.length > 0 && (
                      <div className="flex items-center gap-2 text-danger animate-pulse">
                        <ShieldAlert className="w-5 h-5" />
                        <span className="text-sm font-bold">{anomalies.length} Anomalies Detected</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] flex flex-col justify-between">
                  <div>
                    <span className="technical-label">Active Floors</span>
                    <div className="flex flex-wrap gap-2 mt-4">
                      {[4, 5, 6, 7].map(f => (
                        <div key={f} className="w-10 h-10 rounded-xl bg-surface-700 flex items-center justify-center font-bold text-sm">
                          {f}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-6 border-t border-surface-100/5">
                    <span className="technical-label">Monthly Total (AHU)</span>
                    <div className="mt-1">
                      <p className="text-2xl font-black text-primary">{monthlyTotal.toFixed(2)} <span className="text-sm text-surface-500 font-bold">MWh</span></p>
                      <p className="text-sm font-bold text-accent">{(monthlyTotal * 1000).toLocaleString()} kWh</p>
                    </div>
                  </div>
                  <div className="pt-6 border-t border-surface-100/5">
                    <span className="technical-label">Equipment Count</span>
                    <p className="text-2xl font-black mt-1">{equipment.length} <span className="text-sm text-surface-500 font-bold">UNITS</span></p>
                  </div>
                </div>
              </div>

              {/* Advanced Analytics Section */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Heatmap Visualization */}
                <div className="glass-card p-8 rounded-[2.5rem]">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <span className="technical-label">Interactive Heatmap</span>
                      <h3 className="text-xl font-bold tracking-tight">Floor Intensity</h3>
                    </div>
                    <Flame className="w-6 h-6 text-warning" />
                  </div>
                  <div className="space-y-4">
                    {heatmapData.map(f => (
                      <button 
                        key={f.floor} 
                        onClick={() => {
                          setSelectedFloor(f.floor);
                          setActiveTab('monitor');
                        }}
                        className="w-full text-left space-y-2 group"
                      >
                        <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                          <span className="group-hover:text-primary transition-colors">Floor {f.floor}</span>
                          <span className="group-hover:text-primary transition-colors">{f.ahu.toFixed(2)} MWh</span>
                        </div>
                        <div className="h-3 bg-surface-900 rounded-full overflow-hidden border border-surface-100/5 group-hover:border-primary/20 transition-all">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${f.intensity * 100}%` }}
                            className="h-full bg-gradient-to-r from-primary to-warning"
                            style={{ opacity: 0.3 + (f.intensity * 0.7) }}
                          />
                        </div>
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-surface-500 mt-6 uppercase tracking-widest font-bold">Click floor to monitor live data</p>
                </div>

                {/* Floor Distribution Pie Chart */}
                <div className="glass-card p-8 rounded-[2.5rem]">
                  <div className="flex items-center justify-between mb-8">
                    <div>
                      <span className="technical-label">Consumption Split</span>
                      <h3 className="text-xl font-bold tracking-tight">Floor Distribution</h3>
                    </div>
                    <PieChartIcon className="w-6 h-6 text-accent" />
                  </div>
                  <div className="h-[200px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={floorMetrics}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          paddingAngle={5}
                          dataKey="ahu"
                          nameKey="floor"
                        >
                          {floorMetrics.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][index % 4]} />
                          ))}
                        </Pie>
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                          formatter={(value: number) => [`${value.toFixed(2)} MWh`, 'Consumption']}
                          labelFormatter={(floor) => `Floor ${floor}`}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex justify-center gap-4 mt-4">
                    {floorMetrics.map((m, i) => (
                      <div key={m.floor} className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: ['#6366f1', '#10b981', '#f43f5e', '#f59e0b'][i % 4] }} />
                        <span className="text-[10px] font-bold text-surface-400 uppercase">F{m.floor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Chart Section */}
              <div className="glass-card p-8 rounded-[2.5rem]">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <span className="technical-label">Consumption Trends</span>
                    <h3 className="text-xl font-bold tracking-tight">Monthly AHU Performance</h3>
                  </div>
                  <BarChart3 className="w-6 h-6 text-primary" />
                </div>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                      <XAxis 
                        dataKey="date" 
                        stroke="#475569" 
                        fontSize={10} 
                        tickFormatter={(str) => str.split('-').slice(1).join('/')}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px' }}
                        itemStyle={{ color: '#6366f1', fontWeight: 'bold' }}
                      />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === chartData.length - 1 ? '#6366f1' : '#334155'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Floor Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {floorMetrics.map(m => (
                  <div key={m.floor} className="glass-card p-6 rounded-3xl">
                    <span className="technical-label">Floor {m.floor}</span>
                    <div className="mt-4 space-y-3">
                      <div>
                        <p className="text-xs text-surface-500 font-bold uppercase tracking-wider">AHU</p>
                        <p className="text-xl font-black data-value">{m.ahu.toFixed(2)} <span className="text-[10px] text-surface-600">MWh</span></p>
                      </div>
                      {m.floor === 4 && (
                        <div>
                          <p className="text-xs text-surface-500 font-bold uppercase tracking-wider">Pantry</p>
                          <p className="text-xl font-black data-value text-secondary">{m.pantry.toFixed(3)} <span className="text-[10px] text-surface-600">MWh</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Audit View */}
          {activeTab === 'audit' && (
            <motion.div 
              key="audit" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <span className="technical-label">Data Acquisition</span>
                  <h1 className="text-4xl font-black tracking-tighter uppercase mt-1">Audit Entry</h1>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex p-1 bg-surface-900 rounded-2xl border border-surface-100/5">
                    {[4, 5, 6, 7].map(f => (
                      <button 
                        key={f} onClick={() => setSelectedFloor(f)}
                        className={cn("px-4 py-2 rounded-xl text-sm font-bold transition-all", selectedFloor === f ? "bg-primary text-white shadow-lg" : "text-surface-500 hover:text-surface-50")}
                      >
                        F{f}
                      </button>
                    ))}
                  </div>
                </div>
              </header>

              <div className="grid grid-cols-1 xl:grid-cols-3 gap-10">
                <div className="xl:col-span-2 space-y-6">
                  {equipment
                    .filter(e => e.floorNumber === selectedFloor)
                    .sort((a, b) => (a.ahuNumber || 0) - (b.ahuNumber || 0))
                    .map(equip => {
                      const key = equip.equipmentType === 'AHU' ? `AHU-${equip.ahuNumber}` : `Pantry-${equip.wing}`;
                      const input = liveInputs[key] || { initial: '', final: '' };
                      const consumption = (parseFloat(input.final) - parseFloat(input.initial)) || 0;

                      return (
                        <div key={key} className="glass-card p-6 rounded-[2rem] flex flex-col md:flex-row md:items-center gap-8 group">
                          <div className="flex items-center gap-4 min-w-[140px]">
                            <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center shadow-inner", equip.equipmentType === 'AHU' ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary")}>
                              {equip.equipmentType === 'AHU' ? <Activity className="w-6 h-6" /> : <Droplets className="w-6 h-6" />}
                            </div>
                            <div>
                              <h4 className="font-black text-lg leading-none">{equip.equipmentType === 'AHU' ? `AHU ${equip.ahuNumber}` : `Pantry ${equip.wing}`}</h4>
                              <span className="technical-label">Floor {equip.floorNumber}</span>
                            </div>
                          </div>

                          <div className="flex-1 grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <label className="technical-label">Initial Value</label>
                              <input 
                                type="number" value={input.initial} onChange={(e) => handleInputChange(key, 'initial', e.target.value)}
                                className="glass-input w-full"
                                placeholder="0.00"
                              />
                            </div>
                            <div className="space-y-2">
                              <label className="technical-label">Final Value</label>
                              <input 
                                type="number" value={input.final} onChange={(e) => handleInputChange(key, 'final', e.target.value)}
                                className="glass-input w-full"
                                placeholder="0.00"
                              />
                            </div>
                          </div>

                          <div className="md:w-32 text-right">
                            <span className="technical-label">Consumption</span>
                            <p className={cn("text-2xl font-black data-value mt-1", consumption > 0 ? "text-accent" : "text-surface-600")}>
                              {consumption.toFixed(equip.equipmentType === 'AHU' ? 2 : 3)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>

                <div className="space-y-6">
                  <div className="glass-panel p-8 rounded-[2.5rem] sticky top-12">
                    <h3 className="text-xl font-black uppercase tracking-tighter mb-6">Submission Summary</h3>
                    
                    <div className="mb-8 space-y-2">
                      <div className="flex justify-between items-end">
                        <span className="technical-label">Audit Progress</span>
                        <span className="text-xs font-black text-primary">{auditProgress.completed} / {auditProgress.total}</span>
                      </div>
                      <div className="h-2 bg-surface-900 rounded-full overflow-hidden border border-surface-100/5">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${auditProgress.percentage}%` }}
                          className="h-full bg-primary shadow-[0_0_10px_var(--primary-glow)]"
                        />
                      </div>
                    </div>

                    <div className="space-y-4 mb-8">
                      <div className="flex justify-between items-center py-3 border-b border-surface-100/5">
                        <span className="text-surface-400 font-medium">Floor Selected</span>
                        <span className="font-black">FLOOR {selectedFloor}</span>
                      </div>
                      <div className="flex justify-between items-center py-3 border-b border-surface-100/5">
                        <span className="text-surface-400 font-medium">Audit Date</span>
                        <span className="font-black">{selectedDate}</span>
                      </div>
                      <div className="flex justify-between items-center py-3">
                        <span className="text-surface-400 font-medium">Units Ready</span>
                        <span className="font-black text-primary">
                          {Object.values(liveInputs).filter((i: any) => i.initial && i.final).length} / {equipment.filter(e => e.floorNumber === selectedFloor).length}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={handleSave} disabled={loading}
                      className="w-full py-5 bg-surface-100 text-surface-950 font-black rounded-2xl hover:bg-surface-100 transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50"
                    >
                      {loading ? <Activity className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                      SYNC TO DATABASE
                    </button>

                    <AnimatePresence>
                      {success && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-4 bg-accent/10 border border-accent/20 rounded-xl flex items-center gap-3 text-accent">
                          <CheckCircle2 className="w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">{success}</span>
                        </motion.div>
                      )}
                      {error && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 p-4 bg-danger/10 border border-danger/20 rounded-xl flex items-center gap-3 text-danger">
                          <AlertCircle className="w-5 h-5" />
                          <span className="text-xs font-bold uppercase tracking-wider">{error}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* History View */}
          {activeTab === 'history' && (
            <motion.div 
              key="history" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <span className="technical-label">Archived Data</span>
                  <h1 className="text-4xl font-black tracking-tighter uppercase mt-1">Reading History</h1>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-2xl">
                    <Calendar className="w-5 h-5 text-primary" />
                    <input 
                      type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                      className="bg-transparent border-none text-sm font-bold text-surface-50 outline-none cursor-pointer"
                    />
                  </div>
                  <button 
                    onClick={exportToPDF}
                    className="flex items-center gap-2 px-6 py-3 bg-surface-100 text-surface-950 font-black rounded-2xl hover:bg-surface-100 transition-all shadow-xl"
                  >
                    <FileDown className="w-5 h-5" />
                    EXPORT PDF
                  </button>
                </div>
              </header>

              <div className="glass-panel rounded-[2.5rem] overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-900/50 border-b border-surface-100/5">
                        <th className="px-8 py-6 technical-label">Timestamp</th>
                        <th className="px-8 py-6 technical-label">Floor</th>
                        <th className="px-8 py-6 technical-label">Unit</th>
                        <th className="px-8 py-6 technical-label text-right">Initial</th>
                        <th className="px-8 py-6 technical-label text-right">Final</th>
                        <th className="px-8 py-6 technical-label text-right">Consumption</th>
                        <th className="px-8 py-6 technical-label">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-surface-100/5">
                      {readings.slice(0, 50).map(r => (
                        <tr key={r.id} className="hover:bg-surface-100/5 transition-colors group">
                          <td className="px-8 py-5">
                            <p className="text-sm font-bold">{new Date(r.timestamp).toLocaleDateString()}</p>
                            <p className="text-[10px] text-surface-500 font-mono">{new Date(r.timestamp).toLocaleTimeString()}</p>
                          </td>
                          <td className="px-8 py-5">
                            <span className="px-3 py-1 bg-surface-800 rounded-lg text-xs font-black">F{r.floorNumber}</span>
                          </td>
                          <td className="px-8 py-5">
                            <div className="flex items-center gap-2">
                              <div className={cn("w-2 h-2 rounded-full", (r.equipmentType || 'AHU') === 'AHU' ? "bg-primary" : "bg-secondary")} />
                              <span className="font-bold">{(r.equipmentType || 'AHU') === 'AHU' ? `AHU ${r.ahuNumber}` : `Pantry ${r.wing}`}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5 text-right font-mono text-sm text-surface-400">{r.initialValue.toFixed(2)}</td>
                          <td className="px-8 py-5 text-right font-mono text-sm text-surface-400">{r.finalValue.toFixed(2)}</td>
                          <td className="px-8 py-5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              {anomalies.some(a => a.id === r.id) && (
                                <ShieldAlert className="w-4 h-4 text-danger animate-pulse" />
                              )}
                              <span className="font-mono font-black text-surface-50">{r.consumption.toFixed((r.equipmentType || 'AHU') === 'AHU' ? 2 : 3)}</span>
                            </div>
                          </td>
                          <td className="px-8 py-5">
                            <button 
                              onClick={() => r.id && handleDelete(r.id)}
                              className="p-2 text-surface-600 hover:text-danger hover:bg-danger/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {readings.length === 0 && (
                  <div className="p-20 text-center">
                    <Activity className="w-12 h-12 text-surface-700 mx-auto mb-4" />
                    <p className="text-surface-500 font-bold uppercase tracking-widest">No records found in database</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Monitor View */}
          {activeTab === 'monitor' && (
            <motion.div 
              key="monitor" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <header className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <span className="technical-label">Real-time Monitoring</span>
                  <h1 className="text-4xl font-black tracking-tighter uppercase mt-1">Live Readings</h1>
                </div>
                <div className="flex items-center gap-3 glass-panel px-4 py-2 rounded-2xl">
                  <Calendar className="w-5 h-5 text-primary" />
                  <input 
                    type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)}
                    className="bg-transparent border-none text-sm font-bold text-surface-50 outline-none cursor-pointer"
                  />
                </div>
              </header>

              <div className="grid grid-cols-1 gap-8">
                {[4, 5, 6, 7].map(floor => {
                  const floorEquip = equipment.filter(e => e.floorNumber === floor);
                  if (floorEquip.length === 0) return null;

                  return (
                    <div key={floor} className="space-y-4">
                      <div className="flex items-center gap-4">
                        <div className="h-px flex-1 bg-surface-100/5"></div>
                        <span className="technical-label">Floor {floor}</span>
                        <div className="h-px flex-1 bg-surface-100/5"></div>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        {floorEquip
                          .sort((a, b) => (a.ahuNumber || 0) - (b.ahuNumber || 0))
                          .map(equip => {
                            const reading = readings.find(r => 
                              r.floorNumber === floor && 
                              r.equipmentType === equip.equipmentType &&
                              r.timestamp.startsWith(selectedDate) &&
                              (equip.equipmentType === 'AHU' ? r.ahuNumber === equip.ahuNumber : r.wing === equip.wing)
                            );

                            return (
                              <div key={equip.id} className="glass-card p-5 rounded-3xl">
                                <div className="flex items-center justify-between mb-4">
                                  <div className="flex items-center gap-3">
                                    <div className={cn(
                                      "w-8 h-8 rounded-xl flex items-center justify-center",
                                      equip.equipmentType === 'AHU' ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary"
                                    )}>
                                      {equip.equipmentType === 'AHU' ? <Activity className="w-4 h-4" /> : <Droplets className="w-4 h-4" />}
                                    </div>
                                    <span className="font-black text-sm uppercase tracking-tighter">
                                      {equip.equipmentType === 'AHU' ? `AHU ${equip.ahuNumber}` : `Pantry ${equip.wing}`}
                                    </span>
                                  </div>
                                  {reading ? (
                                    <div className="w-2 h-2 rounded-full bg-accent shadow-[0_0_8px_var(--primary-glow)]"></div>
                                  ) : (
                                    <div className="w-2 h-2 rounded-full bg-surface-700"></div>
                                  )}
                                </div>

                                <div className="space-y-3">
                                  <div className="flex justify-between items-end">
                                    <span className="technical-label">Initial</span>
                                    <span className="font-mono font-bold text-sm">{reading ? reading.initialValue.toFixed(2) : '---'}</span>
                                  </div>
                                  <div className="flex justify-between items-end">
                                    <span className="technical-label">Final</span>
                                    <span className="font-mono font-bold text-sm">{reading ? reading.finalValue.toFixed(2) : '---'}</span>
                                  </div>
                                  <div className="pt-3 border-t border-surface-100/5 flex justify-between items-end">
                                    <span className="technical-label">Consumption</span>
                                    <span className={cn(
                                      "font-mono font-black text-lg",
                                      reading ? "text-accent" : "text-surface-600"
                                    )}>
                                      {reading ? reading.consumption.toFixed(equip.equipmentType === 'AHU' ? 2 : 3) : '0.00'}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* Settings View */}
          {activeTab === 'settings' && (
            <motion.div 
              key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
              className="space-y-10"
            >
              <header>
                <span className="technical-label">System Preferences</span>
                <h1 className="text-4xl font-black tracking-tighter uppercase mt-1">Configuration</h1>
              </header>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="glass-card p-8 rounded-[2.5rem] space-y-8">
                  <div>
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Palette className="w-5 h-5 text-primary" />
                      Visual Theme
                      <span className="ml-auto text-[10px] text-accent font-black uppercase tracking-widest bg-accent/10 px-2 py-0.5 rounded-full">Auto-saved</span>
                    </h3>
                    <p className="text-sm text-surface-400 mb-6">Customize the application appearance.</p>
                    
                    <div className="space-y-6">
                      <div className="flex items-center justify-between p-4 bg-surface-900 rounded-2xl border border-surface-100/5">
                        <span className="text-sm font-bold">Display Mode</span>
                        <div className="flex p-1 bg-surface-800 rounded-xl">
                          <button 
                            onClick={() => setThemeMode('light')}
                            className={cn("p-2 rounded-lg transition-all", themeMode === 'light' ? "bg-surface-100 text-surface-950 shadow-lg" : "text-surface-500 hover:text-surface-300")}
                          >
                            <Sun className="w-4 h-4" />
                          </button>
                          <button 
                            onClick={() => setThemeMode('dark')}
                            className={cn("p-2 rounded-lg transition-all", themeMode === 'dark' ? "bg-surface-950 text-surface-50 shadow-lg" : "text-surface-500 hover:text-surface-300")}
                          >
                            <Moon className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <span className="technical-label">Accent Color</span>
                        <div className="flex items-center gap-3">
                          {[
                            { id: 'indigo', color: '#6366f1' },
                            { id: 'emerald', color: '#10b981' },
                            { id: 'rose', color: '#f43f5e' },
                            { id: 'amber', color: '#f59e0b' },
                            { id: 'violet', color: '#8b5cf6' }
                          ].map(c => (
                            <button 
                              key={c.id}
                              onClick={() => setThemeColor(c.id as any)}
                              className={cn(
                                "w-8 h-8 rounded-full border-2 transition-all",
                                themeColor === c.id ? "border-surface-100 scale-125 shadow-lg" : "border-transparent hover:scale-110"
                              )}
                              style={{ backgroundColor: c.color }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-surface-100/5">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Settings className="w-5 h-5 text-primary" />
                      Interface Scaling
                    </h3>
                    <p className="text-sm text-surface-400 mb-6">Adjust the global font size and UI density.</p>
                    <div className="space-y-4">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-surface-500">
                        <span>Compact</span>
                        <span>Standard</span>
                        <span>Large</span>
                      </div>
                      <input 
                        type="range" min="12" max="24" step="1" value={uiSize} onChange={(e) => setUiSize(parseInt(e.target.value))}
                        className="w-full"
                      />
                      <p className="text-center font-mono font-bold text-primary">{uiSize}px</p>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-surface-100/5">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <ShieldAlert className="w-5 h-5 text-primary" />
                      Sharing & Access
                    </h3>
                    <p className="text-sm text-surface-400 mb-6">Manage user permissions for this project.</p>
                    <div className="space-y-4">
                      {users.map(u => (
                        <div key={u.id} className="p-4 bg-surface-900 rounded-2xl border border-surface-100/5 flex items-center justify-between">
                          <div>
                            <p className="font-bold">{u.email}</p>
                            <p className="text-sm text-surface-400">{u.role}</p>
                          </div>
                          <select 
                            value={u.role} 
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                            className="bg-surface-800 border border-surface-100/5 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:border-primary/50"
                          >
                            <option value="Admin">Admin</option>
                            <option value="Manager">Manager</option>
                            <option value="Auditor">Auditor</option>
                            <option value="Viewer">Viewer</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-8 border-t border-surface-100/5">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Bell className="w-5 h-5 text-primary" />
                      Notifications
                    </h3>
                    <p className="text-sm text-surface-400 mb-6">Receive alerts for anomalies and save confirmations.</p>
                    <button 
                      onClick={requestNotificationPermission}
                      className={cn(
                        "w-full py-4 rounded-2xl font-black transition-all border flex items-center justify-center gap-3",
                        'Notification' in window && Notification.permission === 'granted'
                          ? "bg-accent/10 text-accent border-accent/20"
                          : "bg-surface-900 text-surface-400 border-surface-100/5 hover:bg-surface-800"
                      )}
                    >
                      {'Notification' in window && Notification.permission === 'granted' ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
                      { 'Notification' in window && Notification.permission === 'granted' ? "NOTIFICATIONS ACTIVE" : "ENABLE PUSH NOTIFICATIONS" }
                    </button>
                  </div>

                  <div className="pt-8 border-t border-surface-100/5">
                    <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                      <Building2 className="w-5 h-5 text-primary" />
                      Building Profile
                    </h3>
                    <div className="space-y-3 mt-4">
                      <div className="p-4 bg-surface-900 rounded-2xl border border-surface-100/5">
                        <span className="technical-label">Project Name</span>
                        <p className="font-bold">AHU Monitoring System</p>
                      </div>
                      <div className="p-4 bg-surface-900 rounded-2xl border border-surface-100/5">
                        <span className="technical-label">Location</span>
                        <p className="font-bold">Main Facility - Floors 4-7</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="glass-card p-8 rounded-[2.5rem] flex flex-col justify-between">
                  <div>
                    <h3 className="text-lg font-bold mb-6">Operator Information</h3>
                    <div className="flex items-center gap-6 p-6 bg-surface-900 rounded-3xl border border-surface-100/5">
                      <img src={user.photoURL || ''} className="w-20 h-20 rounded-2xl border-2 border-primary/20" referrerPolicy="no-referrer" />
                      <div>
                        <p className="text-xl font-black tracking-tight">{user.displayName}</p>
                        <p className="text-surface-400 text-sm font-medium">{user.email}</p>
                        <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 bg-accent/10 text-accent rounded-full text-[10px] font-black uppercase tracking-widest">
                          Authorized Auditor
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8">
                    <button 
                      onClick={handleLogout}
                      className="w-full py-4 bg-danger/10 text-danger font-black rounded-2xl hover:bg-danger/20 transition-all border border-danger/20 flex items-center justify-center gap-3"
                    >
                      <LogOut className="w-5 h-5" />
                      TERMINATE OPERATOR SESSION
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Navigation */}
      <AnimatePresence>
        {!isSidebarOpen && (
          <motion.nav 
            initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }}
            className="fixed bottom-0 left-0 right-0 z-50 glass-panel border-t border-surface-100/10 px-6 py-2 flex items-center justify-between"
          >
            <NavItem id="dashboard" icon={LayoutDashboard} label="Dashboard" />
            <NavItem id="audit" icon={PlusCircle} label="Audit" />
            <NavItem id="monitor" icon={Monitor} label="Live" />
            <NavItem id="history" icon={History} label="History" />
            <NavItem id="settings" icon={Settings} label="Config" />
          </motion.nav>
        )}
      </AnimatePresence>
    </div>
  );
}
