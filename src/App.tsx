import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Home, Building, Smile, 
  Briefcase, AlertCircle, Star, Sun, FileText, BookOpen, 
  Paperclip, Trash2, ChevronLeft, ChevronRight, Cloud, 
  CloudOff, LogIn, LogOut, Share2, Eye, List, Heart
} from 'lucide-react';

// --- Importações do Firebase (Nuvem) ---
import { initializeApp } from 'firebase/app';
import { 
  getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged, 
  GoogleAuthProvider, signInWithPopup, signOut 
} from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

// Configuração do Firebase injetada automaticamente
const firebaseConfig = {
  apiKey: "AIzaSyBsFNVRAcKj8JHxtQcp1ECpENjxjm5UmJI",
  authDomain: "meu-banco-de-horas-ana-azzas.firebaseapp.com",
  projectId: "meu-banco-de-horas-ana-azzas",
  storageBucket: "meu-banco-de-horas-ana-azzas.firebasestorage.app",
  messagingSenderId: "190453048565",
  appId: "1:190453048565:web:9c4a4c41480c46f67951bc"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const googleProvider = new GoogleAuthProvider();

// --- Funções Utilitárias de Tempo ---
const timeToMins = (timeStr) => {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};

const minsToTime = (mins, forceSign = false) => {
  if (isNaN(mins)) return "00:00";
  const isNeg = mins < 0;
  const abs = Math.abs(mins);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const sign = isNeg ? '-' : (forceSign ? '+' : '');
  return `${sign}${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

// --- Mágica dos Feriados Nacionais ---
const getBrazilianHolidays = (year) => {
  const addDays = (date, days) => {
    const result = new Date(date.valueOf());
    result.setDate(result.getDate() + days);
    return `${result.getFullYear()}-${String(result.getMonth()+1).padStart(2,'0')}-${String(result.getDate()).padStart(2,'0')}`;
  };

  // Cálculo da Páscoa para descobrir feriados móveis
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = new Date(year, month - 1, day);

  return {
    [`${year}-01-01`]: "Confraternização Universal",
    [`${year}-04-21`]: "Tiradentes",
    [`${year}-05-01`]: "Dia do Trabalhador",
    [`${year}-09-07`]: "Independência do Brasil",
    [`${year}-10-12`]: "Nossa Sra. Aparecida",
    [`${year}-11-02`]: "Finados",
    [`${year}-11-15`]: "Proclamação da República",
    [`${year}-11-20`]: "Consciência Negra",
    [`${year}-12-25`]: "Natal",
    [addDays(easter, -47)]: "Carnaval",
    [addDays(easter, -2)]: "Sexta-feira Santa",
    [addDays(easter, 60)]: "Corpus Christi"
  };
};

const isDateHoliday = (dateStr) => {
  const [y] = dateStr.split('-');
  const holidays = getBrazilianHolidays(parseInt(y, 10));
  return !!holidays[dateStr];
};

const getDefaultRecord = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const isHoliday = isDateHoliday(dateStr);

  return {
    type: isWeekend ? 'Fim de Semana' : (isHoliday ? 'Feriado' : 'Trabalho Normal'),
    timeIn: '',
    lunchStart: '',
    lunchEnd: '',
    timeOut: '',
    medical: '',
    hasMedicalAbsence: false,
    medicalAttachment: null,
    workModel: 'Home Office',
    agenda: '',
    noAgenda: false,
    mood: '🙂',
    deliveries: '',
    observations: ''
  };
};

const typeConfig = {
  'Trabalho Normal': { icon: '💼', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Fim de Semana': { icon: '🛋️', color: 'bg-slate-50 text-slate-500 border-slate-200' },
  'Folga (Banco)': { icon: '🌴', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Folga de Feriado': { icon: '🎉', color: 'bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200' },
  'Feriado': { icon: '🚀', color: 'bg-purple-50 text-purple-700 border-purple-200' },
  'Atestado': { icon: '🏥', color: 'bg-rose-50 text-rose-700 border-rose-200' },
  'Falta': { icon: '⚠️', color: 'bg-orange-50 text-orange-700 border-orange-200' },
};

export default function App() {
  const [currentDate, setCurrentDate] = useState(getTodayString());
  const [records, setRecords] = useState({});
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState('synced');
  const [pendingSave, setPendingSave] = useState(null);
  const [weather, setWeather] = useState({});
  
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('shareId');
  const isReadOnly = !!shareId;

  // --- Previsão do Tempo ---
  useEffect(() => {
    // Busca previsão do tempo gratuita baseada na região aproximada (Campo Bom/RS)
    fetch('https://api.open-meteo.com/v1/forecast?latitude=-29.6769&longitude=-51.0583&daily=weathercode,temperature_2m_max,temperature_2m_min&timezone=America%2FSao_Paulo')
      .then(res => res.json())
      .then(data => {
        if (data && data.daily) {
          const weatherMap = {};
          data.daily.time.forEach((date, index) => {
            weatherMap[date] = {
              code: data.daily.weathercode[index],
              max: data.daily.temperature_2m_max[index],
              min: data.daily.temperature_2m_min[index],
            };
          });
          setWeather(weatherMap);
        }
      })
      .catch(err => console.log("Não foi possível carregar a previsão do tempo.", err));
  }, []);

  const getWeatherEmoji = (code) => {
     if (code === 0) return '☀️'; // Limpo
     if (code >= 1 && code <= 3) return '🌤️'; // Parcialmente nublado
     if (code >= 45 && code <= 48) return '🌫️'; // Névoa
     if (code >= 51 && code <= 67) return '🌧️'; // Chuva
     if (code >= 71 && code <= 77) return '❄️'; // Neve
     if (code >= 80 && code <= 82) return '🌦️'; // Pancadas
     if (code >= 95) return '⛈️'; // Tempestade
     return '🌡️';
  };

  // --- Autenticação ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (isReadOnly) {
          await signInAnonymously(auth);
        } else {
          setLoading(false);
        }
      } catch (err) {
        console.error("Erro de Autenticação:", err);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser || isReadOnly) setLoading(false);
    });
    return () => unsubscribe();
  }, [isReadOnly]);

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Erro ao logar", err);
      setLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Buscar Dados da Nuvem ---
  useEffect(() => {
    if (!user && !isReadOnly) return;
    const targetUid = shareId || user?.uid;
    if (!targetUid) return;

    setLoading(true);
    const recordsRef = collection(db, 'artifacts', appId, 'users', targetUid, 'daily_records');
    
    const unsubscribe = onSnapshot(recordsRef, (snapshot) => {
      const fetchedRecords = {};
      snapshot.forEach((doc) => {
        fetchedRecords[doc.id] = doc.data();
      });
      setRecords(fetchedRecords);
      setLoading(false);
      setSyncStatus('synced');
    }, (error) => {
      console.error("Erro na nuvem:", error);
      setSyncStatus('error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, shareId, isReadOnly]);

  // --- Salvar na Nuvem ---
  useEffect(() => {
    if (!pendingSave || !user || isReadOnly) return;
    
    setSyncStatus('syncing');
    const timer = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'daily_records', pendingSave.date);
        await setDoc(docRef, pendingSave.record);
        setSyncStatus('synced');
      } catch (err) {
        console.error("Erro ao salvar:", err);
        setSyncStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [pendingSave, user, isReadOnly]);


  const currentRecord = records[currentDate] || getDefaultRecord(currentDate);

  const updateField = (field, value) => {
    if (isReadOnly) return;

    setRecords(prev => {
      const updatedRecord = {
        ...(prev[currentDate] || getDefaultRecord(currentDate)),
        [field]: value
      };
      const newState = { ...prev, [currentDate]: updatedRecord };
      setPendingSave({ date: currentDate, record: updatedRecord });
      return newState;
    });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateField('medicalAttachment', { name: file.name, data: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleShare = () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${user.uid}`;
    const tempInput = document.createElement('input');
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    alert("Link copiado! Envie este link para a sua líder.");
  };

  // --- Lógica de Cálculo (Fixado em 6 Horas e Tolerância) ---
  const calculateDayStats = (record) => {
    if (!record) return { workedMins: 0, balanceMins: 0 };
    const inM = timeToMins(record.timeIn);
    const lsM = timeToMins(record.lunchStart);
    const leM = timeToMins(record.lunchEnd);
    const outM = timeToMins(record.timeOut);
    
    // A Ana Paula trabalha sempre 6 horas por dia (360 minutos)
    const reqM = (record.type === 'Fim de Semana' || record.type === 'Feriado' || record.type === 'Folga (Banco)') ? 0 : 360; 
    const medM = record.hasMedicalAbsence ? timeToMins(record.medical) : 0;
    
    let workedMins = 0;
    if (record.timeIn && record.lunchStart) workedMins += (lsM - inM);
    if (record.lunchEnd && record.timeOut) workedMins += (outM - leM);

    let balanceMins = 0;
    switch (record.type) {
      case 'Trabalho Normal':
      case 'Falta':
        balanceMins = (workedMins + medM) - reqM;
        break;
      case 'Folga (Banco)':
      case 'Folga de Feriado': // Folga de Feriado atua descontando as 6h do banco para "gastar" o que ganhou trabalhando no feriado!
        balanceMins = workedMins - 360; 
        break;
      case 'Feriado': // Se trabalhar no feriado, ganha 100% das horas positivas (reqM=0)
      case 'Atestado':
      case 'Fim de Semana':
        balanceMins = workedMins; 
        break;
      default:
        balanceMins = 0;
    }

    // Tolerância: 10 minutos pra mais ou pra menos num dia normal não contam!
    if (record.type === 'Trabalho Normal' && Math.abs(balanceMins) <= 10) {
      balanceMins = 0;
    }

    return { workedMins, balanceMins };
  };

  const stats = useMemo(() => {
    let monthBalance = 0;
    let yearBalance = 0;
    const [currentYear, currentMonth] = currentDate.split('-');

    Object.entries(records).forEach(([dateStr, record]) => {
      const { balanceMins } = calculateDayStats(record);
      const [year, month] = dateStr.split('-');
      if (year === currentYear) {
        yearBalance += balanceMins;
        if (month === currentMonth) {
          monthBalance += balanceMins;
        }
      }
    });
    return { monthBalance, yearBalance };
  }, [records, currentDate]);

  const { workedMins, balanceMins: dayBalance } = calculateDayStats(currentRecord);

  // --- Telas de Carregamento e Login ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf5f7] flex flex-col items-center justify-center gap-4">
        <div className="animate-spin text-pink-500"><Cloud size={48} /></div>
        <h2 className="text-xl font-bold text-slate-700">Carregando Banco de Horas...</h2>
      </div>
    );
  }

  if (!user && !isReadOnly && typeof __initial_auth_token === 'undefined') {
    return (
      <div className="min-h-screen bg-[#faf5f7] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border-2 border-pink-100 max-w-md w-full text-center flex flex-col items-center gap-6">
          <div className="bg-pink-100 p-4 rounded-3xl text-pink-500 rotate-3">
            <Heart size={48} fill="currentColor"/>
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">Banco de Horas</h1>
            <p className="text-slate-500 font-medium">Faça login para aceder ao seu painel.</p>
          </div>
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-pink-500 text-white p-4 rounded-2xl font-bold hover:bg-pink-600 transition-all flex items-center justify-center gap-3 text-lg shadow-md mt-4"
          >
            <LogIn size={24} />
            Entrar com o Google
          </button>
        </div>
      </div>
    );
  }

  // --- Calendário Auxiliares ---
  const [yearStr, monthStr] = currentDate.split('-');
  const viewYear = parseInt(yearStr, 10);
  const viewMonth = parseInt(monthStr, 10);
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay();

  const handlePrevMonth = () => {
    let y = viewYear;
    let m = viewMonth - 1;
    if (m < 1) { m = 12; y -= 1; }
    setCurrentDate(`${y}-${String(m).padStart(2, '0')}-01`);
  };

  const handleNextMonth = () => {
    let y = viewYear;
    let m = viewMonth + 1;
    if (m > 12) { m = 1; y += 1; }
    setCurrentDate(`${y}-${String(m).padStart(2, '0')}-01`);
  };

  const CardValue = ({ title, value, icon: Icon, isPositive, neutral }) => (
    <div className={`p-4 rounded-3xl border-2 flex items-center gap-4 ${
      neutral ? 'bg-white border-slate-100 text-slate-700' :
      isPositive ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 
      'bg-rose-50 border-rose-100 text-rose-700'
    } shadow-sm transition-transform hover:scale-105`}>
      <div className={`p-3 rounded-2xl ${neutral ? 'bg-slate-100' : isPositive ? 'bg-emerald-200' : 'bg-rose-200'}`}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-sm font-semibold opacity-80">{title}</p>
        <p className="text-2xl font-black tracking-tight">{value}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#faf5f7] text-slate-800 font-sans p-4 md:p-8 selection:bg-pink-200">
      
      {isReadOnly && (
        <div className="max-w-7xl mx-auto mb-6 bg-blue-100 text-blue-700 p-3 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 border-blue-200 shadow-sm">
          <Eye size={20} /> Modo de Visualização do Líder
        </div>
      )}

      {/* Header com Coração e Subtítulo da Ana */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-4">
          <div className="bg-pink-200 p-3 rounded-2xl text-pink-600 shadow-sm rotate-3 flex-shrink-0">
            <Heart size={36} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Banco de Horas</h1>
            <h2 className="text-sm font-bold text-slate-500 mb-1">Painel de horas de Ana Paula W. S. dos Santos</h2>
            <div className="flex items-center gap-2 mt-1">
              {!isReadOnly && syncStatus === 'synced' && <span className="flex items-center gap-1 text-emerald-500 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"><Cloud size={14}/> Nuvem Ativa</span>}
              {!isReadOnly && syncStatus === 'syncing' && <span className="flex items-center gap-1 text-blue-500 font-bold text-xs bg-blue-50 px-2 py-1 rounded-lg border border-blue-100"><Cloud size={14} className="animate-pulse"/> A sincronizar...</span>}
              {!isReadOnly && syncStatus === 'error' && <span className="flex items-center gap-1 text-rose-500 font-bold text-xs bg-rose-50 px-2 py-1 rounded-lg border border-rose-100"><CloudOff size={14}/> Offline</span>}
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          {!isReadOnly && (
            <button 
              onClick={handleShare}
              className="bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl font-bold hover:bg-indigo-200 transition-colors flex items-center gap-2 text-sm shadow-sm"
            >
              <Share2 size={18} /> Partilhar
            </button>
          )}
          {user && !isReadOnly && typeof __initial_auth_token === 'undefined' && (
             <button 
               onClick={handleLogout}
               className="bg-white border-2 border-rose-100 text-rose-500 px-4 py-2 rounded-xl font-bold hover:bg-rose-50 transition-colors flex items-center gap-2 text-sm shadow-sm"
             >
               <LogOut size={18} /> Sair
             </button>
          )}
        </div>
      </div>

      {/* Grid Principal */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
        
        {/* Coluna Esquerda: Formulário */}
        <div className="lg:col-span-7">
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border-2 border-purple-50">
            
            {/* Data e Local */}
            <div className="flex flex-col md:flex-row gap-4 mb-8">
              <div className="flex-1 bg-pink-50/50 border-2 border-pink-100 rounded-2xl p-4 flex flex-col justify-center">
                <label className="text-sm font-bold text-pink-500 mb-2 flex items-center gap-2">
                  <Calendar size={18} /> Dia selecionado
                </label>
                <input 
                  type="date" 
                  value={currentDate}
                  onChange={(e) => setCurrentDate(e.target.value)}
                  className="bg-white border-2 border-pink-200 text-slate-800 p-2 rounded-xl font-bold outline-none cursor-pointer w-full"
                />
              </div>

              <div className="flex-1 flex flex-col gap-3">
                <select 
                  disabled={isReadOnly}
                  value={currentRecord.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-3 font-semibold text-slate-700 outline-none w-full"
                >
                  <option value="Trabalho Normal">💼 Dia de Trabalho</option>
                  <option value="Fim de Semana">🛋️ Fim de Semana</option>
                  <option value="Folga (Banco)">🌴 Folga (Banco)</option>
                  <option value="Folga de Feriado">🎉 Folga de Feriado</option>
                  <option value="Feriado">🚀 Feriado</option>
                  <option value="Atestado">🏥 Atestado</option>
                  <option value="Falta">⚠️ Falta</option>
                </select>

                <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-100">
                  {['Home Office', 'Presencial'].map(model => (
                    <button
                      key={model}
                      disabled={isReadOnly}
                      onClick={() => updateField('workModel', model)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center gap-1 ${
                        currentRecord.workModel === model 
                          ? 'bg-white text-purple-600 shadow-sm' 
                          : 'text-slate-400'
                      }`}
                    >
                      {model === 'Home Office' ? <Home size={14}/> : <Building size={14}/>} {model}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Relógios */}
            <div className="bg-purple-50 rounded-3xl p-6 mb-6 border border-purple-100">
              <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                <Clock size={20} /> Registo de Ponto (Meta de 6 Horas)
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Chegada', field: 'timeIn', icon: '🌅' },
                  { label: 'Saída Almoço', field: 'lunchStart', icon: '🍲' },
                  { label: 'Volta Almoço', field: 'lunchEnd', icon: '☕' },
                  { label: 'Saída', field: 'timeOut', icon: '🌆' }
                ].map(item => (
                  <div key={item.field} className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-purple-600/70 ml-1">{item.icon} {item.label}</label>
                    <input 
                      type="time" 
                      disabled={isReadOnly}
                      value={currentRecord[item.field]}
                      onChange={(e) => updateField(item.field, e.target.value)}
                      className="w-full bg-white border-2 border-purple-100 rounded-xl p-2.5 font-bold text-purple-900 outline-none"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center justify-between bg-white p-3 rounded-2xl text-sm border border-purple-100 font-bold text-purple-900">
                <span>Total trabalhado:</span>
                <span className="text-lg bg-purple-100 px-3 py-1 rounded-xl">{minsToTime(workedMins)}</span>
              </div>
            </div>

            {/* ATESTADO MÉDICO */}
            <div className={`mb-8 p-5 rounded-3xl border-2 transition-all duration-300 ${
              currentRecord.hasMedicalAbsence 
                ? 'bg-rose-50 border-rose-200' 
                : 'bg-slate-50 border-slate-200 grayscale-[0.5]'
            }`}>
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={20} className={currentRecord.hasMedicalAbsence ? "text-rose-500" : "text-slate-400"} />
                <label className={`text-sm font-bold flex items-center gap-2 cursor-pointer select-none ${
                  currentRecord.hasMedicalAbsence ? "text-rose-600" : "text-slate-500"
                }`}>
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={currentRecord.hasMedicalAbsence || false}
                    onChange={(e) => updateField('hasMedicalAbsence', e.target.checked)}
                    className="w-4 h-4 rounded border-2 accent-rose-500 cursor-pointer"
                  />
                  Atestado ou Ausência Médica neste dia?
                </label>
              </div>

              {currentRecord.hasMedicalAbsence && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="text-xs font-bold text-rose-500 ml-1 mb-1 block">Horas do Atestado (ex: 02:00)</label>
                    <input 
                      type="time" 
                      disabled={isReadOnly}
                      value={currentRecord.medical}
                      onChange={(e) => updateField('medical', e.target.value)}
                      className="w-full bg-white border-2 border-rose-200 rounded-xl p-2.5 font-bold text-rose-700 outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-rose-500 ml-1 mb-1 block">Anexar Imagem (Foto ou PDF)</label>
                    <input 
                      type="file"
                      accept="image/*,.pdf"
                      disabled={isReadOnly}
                      onChange={handleFileUpload}
                      className="w-full text-xs text-rose-700 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:font-bold file:bg-rose-200 file:text-rose-800 hover:file:bg-rose-300 cursor-pointer"
                    />
                  </div>
                  
                  {currentRecord.medicalAttachment && (
                    <div className="md:col-span-2 flex items-center justify-between bg-white border-2 border-rose-200 rounded-xl p-2 mt-1">
                      <a 
                        href={currentRecord.medicalAttachment.data} 
                        download={currentRecord.medicalAttachment.name}
                        className="flex items-center gap-2 overflow-hidden hover:underline cursor-pointer"
                      >
                        <Paperclip size={14} className="text-rose-400 flex-shrink-0"/>
                        <span className="text-xs truncate text-rose-700 font-medium">
                          {currentRecord.medicalAttachment.name}
                        </span>
                      </a>
                      {!isReadOnly && (
                        <button onClick={() => updateField('medicalAttachment', null)} className="text-rose-400 hover:text-rose-600 p-1">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Pautas do Dia */}
            <div className="bg-slate-50 p-5 rounded-3xl border-2 border-slate-100 mb-6">
              <div className="flex flex-col md:flex-row justify-between md:items-center gap-3 mb-3">
                <label className="text-sm font-bold text-slate-600 flex items-center gap-2">
                  <List size={18} className="text-indigo-400"/> Pautas do Dia
                </label>
                <label className="text-sm font-bold text-slate-500 flex items-center gap-2 cursor-pointer select-none bg-white px-3 py-1.5 rounded-xl border-2 border-slate-100">
                   <input
                     type="checkbox"
                     disabled={isReadOnly}
                     checked={currentRecord.noAgenda || false}
                     onChange={(e) => updateField('noAgenda', e.target.checked)}
                     className="w-4 h-4 text-indigo-500 rounded accent-indigo-500"
                   />
                   Sem pautas no dia
                </label>
              </div>
              <textarea 
                disabled={isReadOnly || currentRecord.noAgenda}
                value={currentRecord.noAgenda ? 'Sem pautas programadas para o dia de hoje.' : currentRecord.agenda}
                onChange={(e) => updateField('agenda', e.target.value)}
                placeholder="Escreva aqui as pautas do seu dia..."
                className="w-full bg-white border-2 border-slate-200 rounded-2xl p-4 min-h-[100px] text-slate-700 outline-none resize-none font-medium disabled:bg-slate-100 disabled:text-slate-400"
              />
            </div>

            {/* Entregas e Humor */}
            <div className="space-y-6">
              <div>
                <label className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                  <FileText size={18} className="text-blue-400"/> Entregas concluídas
                </label>
                <textarea 
                  disabled={isReadOnly}
                  value={currentRecord.deliveries}
                  onChange={(e) => updateField('deliveries', e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[80px] text-slate-700 outline-none resize-none font-medium"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                  <BookOpen size={18} className="text-emerald-400"/> Observações extras
                </label>
                <textarea 
                  disabled={isReadOnly}
                  value={currentRecord.observations}
                  onChange={(e) => updateField('observations', e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[60px] text-slate-700 outline-none resize-none font-medium"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                  <Smile size={18} className="text-orange-400"/> Humor
                </label>
                <div className="flex gap-3">
                  {['🤩', '🙂', '😐', '😫', '🤒'].map(emoji => (
                    <button
                      key={emoji}
                      disabled={isReadOnly}
                      onClick={() => updateField('mood', emoji)}
                      className={`text-3xl p-3 rounded-2xl transition-all ${
                        currentRecord.mood === emoji ? 'bg-orange-100 scale-110 shadow-sm' : 'opacity-40 grayscale'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Coluna Direita: Calendário e Clima */}
        <div className="lg:col-span-5 relative flex flex-col gap-6">
          <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border-2 border-purple-50 sticky top-8">
            <div className="flex flex-col items-center justify-between mb-6 gap-4">
              <div className="flex items-center gap-3 w-full">
                <div className="bg-indigo-100 p-3 rounded-2xl text-indigo-600 flex-shrink-0">
                  <Calendar size={24} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-slate-800">Visão Mensal</h2>
                </div>
              </div>

              <div className="flex items-center gap-1 bg-indigo-50 p-1.5 rounded-2xl border-2 border-indigo-100 w-full justify-between">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all">
                  <ChevronLeft size={20} />
                </button>
                <input
                  type="month"
                  value={`${viewYear}-${String(viewMonth).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-');
                    if (y && m) setCurrentDate(`${y}-${m}-01`);
                  }}
                  className="bg-transparent border-none text-indigo-800 font-bold text-lg p-2 text-center outline-none cursor-pointer uppercase w-full"
                />
                <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-6">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-slate-400 py-1 uppercase">{day}</div>
              ))}
              
              {Array.from({ length: firstDayIndex }).map((_, i) => (<div key={`empty-${i}`} className="p-1" />))}
              
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const record = records[dateStr];
                
                const dateObj = new Date(viewYear, viewMonth - 1, dayNum);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const isNationalHoliday = isDateHoliday(dateStr);
                const holidayName = isNationalHoliday ? getBrazilianHolidays(viewYear)[dateStr] : '';
                const weatherToday = weather[dateStr];

                const config = record ? typeConfig[record.type] : (isWeekend ? typeConfig['Fim de Semana'] : (isNationalHoliday ? typeConfig['Feriado'] : null));
                
                // Mágica do Home Office: Se for dia normal e home office, mostra casinha!
                const isHomeOffice = record && record.type === 'Trabalho Normal' && record.workModel === 'Home Office';
                const displayIcon = isHomeOffice ? '🏠' : (config ? config.icon : '');
                
                const isSelected = dateStr === currentDate;

                return (
                  <button
                    key={dayNum}
                    title={holidayName}
                    onClick={() => setCurrentDate(dateStr)}
                    className={`relative flex flex-col items-center justify-center p-1 rounded-xl border-2 transition-all min-h-[3.5rem] md:min-h-[4.5rem] ${
                      isSelected ? 'ring-4 ring-pink-300 ring-offset-1 scale-105 z-10' : 'hover:scale-105'
                    } ${config ? config.color : 'bg-slate-50 border-slate-100 text-slate-400'}
                      ${isNationalHoliday && !isSelected ? 'ring-2 ring-rose-200' : ''}`}
                  >
                    {isNationalHoliday && (
                      <div title={holidayName} className="absolute top-1 right-1 w-2 h-2 rounded-full bg-rose-500 shadow-sm animate-pulse"></div>
                    )}
                    {weatherToday && (
                      <div className="absolute top-1 left-1 text-[10px] opacity-70">
                        {getWeatherEmoji(weatherToday.code)}
                      </div>
                    )}

                    <span className="font-extrabold text-xs md:text-sm">{dayNum}</span>
                    <span className="text-lg md:text-xl mt-0.5">{displayIcon}</span>
                  </button>
                )
              })}
            </div>

            <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border-2 border-slate-100">
              <div className="flex flex-wrap gap-2 justify-center">
                <div className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg border-2 bg-blue-50 text-blue-700 border-blue-200">
                   <span>🏠</span> Home Office
                </div>
                {Object.entries(typeConfig).map(([type, config]) => (
                  <div key={type} className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg border-2 ${config.color}`}>
                    <span>{config.icon}</span> {type}
                  </div>
                ))}
                <div className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg border-2 bg-white text-slate-600 border-slate-200">
                   <span className="w-2 h-2 rounded-full bg-rose-500 inline-block"></span> Feriado Nacional
                </div>
              </div>
            </div>
          </div>

          {/* Módulo de Previsão do Tempo Exclusivo */}
          {Object.keys(weather).length > 0 && (
            <div className="bg-gradient-to-br from-sky-50 to-blue-50 p-6 rounded-[2.5rem] shadow-sm border-2 border-sky-100 sticky top-[600px]">
              <h3 className="font-bold text-sky-800 mb-4 flex items-center gap-2">
                <Cloud size={20} /> Previsão do Tempo (Campo Bom/RS)
              </h3>
              <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                {Object.entries(weather).map(([date, w]) => {
                   const dateObj = new Date(date + 'T12:00:00');
                   return (
                    <div key={date} className="bg-white p-3 rounded-2xl border-2 border-sky-100 min-w-[70px] flex flex-col items-center flex-shrink-0 shadow-sm">
                      <span className="text-[10px] font-bold text-slate-400 mb-1 uppercase">{dateObj.toLocaleDateString('pt-BR', {weekday: 'short'})}</span>
                      <span className="text-2xl mb-1">{getWeatherEmoji(w.code)}</span>
                      <span className="text-sm font-black text-sky-900">{Math.round(w.max)}°</span>
                      <span className="text-xs font-bold text-sky-400">{Math.round(w.min)}°</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>

      {/* Cartões Acumulados no Final da Página */}
      <div className="max-w-7xl mx-auto mb-8 border-t-2 border-slate-200/60 pt-8">
        <h2 className="text-xl font-extrabold text-slate-700 mb-4 px-2 flex items-center gap-2">
          <Star size={24} className="text-yellow-400" fill="currentColor"/> 
          Seus Acumulados
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardValue title="Saldo do Dia" value={minsToTime(dayBalance, true)} icon={Clock} isPositive={dayBalance > 0} neutral={dayBalance === 0}/>
          <CardValue title="Mês Acumulado" value={minsToTime(stats.monthBalance, true)} icon={Sun} isPositive={stats.monthBalance > 0} neutral={stats.monthBalance === 0}/>
          <CardValue title="Ano Acumulado" value={minsToTime(stats.yearBalance, true)} icon={Briefcase} isPositive={stats.yearBalance > 0} neutral={stats.yearBalance === 0}/>
        </div>
      </div>

    </div>
  );
}
