import React, { useState, useEffect, useMemo } from 'react';
import { 
  Calendar, Clock, Coffee, Home, Building, Smile, 
  Briefcase, AlertCircle, Download, Upload, Star, 
  Heart, Sun, Moon, FileText, BookOpen, Paperclip, Trash2,
  ChevronLeft, ChevronRight, Cloud, CloudOff, LogIn, LogOut, Share2, Eye
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

const getDefaultRecord = (dateStr) => {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dateObj = new Date(y, m - 1, d);
  const dayOfWeek = dateObj.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  return {
    type: isWeekend ? 'Fim de Semana' : 'Trabalho Normal',
    timeIn: '',
    lunchStart: '',
    lunchEnd: '',
    timeOut: '',
    required: isWeekend ? '00:00' : '06:00',
    medical: '',
    hasMedicalAbsence: false,
    medicalAttachment: null,
    workModel: 'Home Office',
    mood: '🙂',
    deliveries: '',
    observations: ''
  };
};

const typeConfig = {
  'Trabalho Normal': { icon: '💼', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  'Fim de Semana': { icon: '🛋️', color: 'bg-slate-50 text-slate-500 border-slate-200' },
  'Folga (Banco)': { icon: '🌴', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'Feriado': { icon: '🎉', color: 'bg-purple-50 text-purple-700 border-purple-200' },
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
  
  // Lógica de Leitura/Compartilhamento
  const urlParams = new URLSearchParams(window.location.search);
  const shareId = urlParams.get('shareId');
  const isReadOnly = !!shareId;

  // --- Passo 1: Autenticação ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          // Ambiente de teste/canvas
          await signInWithCustomToken(auth, __initial_auth_token);
        } else if (isReadOnly) {
          // Se for a líder a ver o link, faz login anónimo só para poder ler os dados
          await signInAnonymously(auth);
        } else {
          // Se for você a abrir o site normalmente fora do canvas, para de carregar para mostrar o botão de Login
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

  // Ações de Login/Logout do Google
  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error("Erro ao fazer login com o Google", err);
      setLoading(false);
    }
  };

  const handleLogout = () => signOut(auth);

  // --- Passo 2: Buscar Dados Iniciais da Nuvem ---
  useEffect(() => {
    if (!user && !isReadOnly) return;
    
    // Se tiver shareId na URL, busca os dados da líder. Se não, busca os seus.
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
      console.error("Erro ao buscar dados da nuvem:", error);
      setSyncStatus('error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, shareId, isReadOnly]);

  // --- Passo 3: Salvar na Nuvem (Apenas se NÃO for Apenas Leitura) ---
  useEffect(() => {
    if (!pendingSave || !user || isReadOnly) return;
    
    setSyncStatus('syncing');
    const timer = setTimeout(async () => {
      try {
        const docRef = doc(db, 'artifacts', appId, 'users', user.uid, 'daily_records', pendingSave.date);
        await setDoc(docRef, pendingSave.record);
        setSyncStatus('synced');
      } catch (err) {
        console.error("Erro ao guardar na nuvem:", err);
        setSyncStatus('error');
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [pendingSave, user, isReadOnly]);


  const currentRecord = records[currentDate] || getDefaultRecord(currentDate);

  const updateField = (field, value) => {
    if (isReadOnly) return; // Impede qualquer edição se a líder estiver a ver

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

  // --- Lógica de Partilha ---
  const handleShare = () => {
    if (!user) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?shareId=${user.uid}`;
    
    // Copia para a área de transferência do computador
    const tempInput = document.createElement('input');
    tempInput.value = shareUrl;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    
    alert("Link de visualização copiado! Envie este link para a sua líder.");
  };

  // --- Lógica de Cálculo ---
  const calculateDayStats = (record) => {
    if (!record) return { workedMins: 0, balanceMins: 0 };
    const inM = timeToMins(record.timeIn);
    const lsM = timeToMins(record.lunchStart);
    const leM = timeToMins(record.lunchEnd);
    const outM = timeToMins(record.timeOut);
    const reqM = timeToMins(record.required);
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
        balanceMins = workedMins - reqM;
        break;
      case 'Feriado':
      case 'Atestado':
      case 'Fim de Semana':
        balanceMins = workedMins;
        break;
      default:
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

  // Telas de Estado
  if (loading) {
    return (
      <div className="min-h-screen bg-[#faf5f7] flex flex-col items-center justify-center gap-4">
        <div className="animate-spin text-pink-500"><Cloud size={48} /></div>
        <h2 className="text-xl font-bold text-slate-700 tracking-tight">A conectar à nuvem... ✨</h2>
      </div>
    );
  }

  // Tela de Login (Se não estiver na versão de teste do canvas e não for a líder a ver)
  if (!user && !isReadOnly && typeof __initial_auth_token === 'undefined') {
    return (
      <div className="min-h-screen bg-[#faf5f7] flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 md:p-12 rounded-[2.5rem] shadow-sm border-2 border-pink-100 max-w-md w-full text-center flex flex-col items-center gap-6">
          <div className="bg-pink-100 p-4 rounded-3xl text-pink-500 rotate-3">
            <Heart size={48} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">Meu Diário de Horas</h1>
            <p className="text-slate-500 font-medium">Faça login para aceder ao seu painel de qualquer lugar do mundo.</p>
          </div>
          <button 
            onClick={handleGoogleLogin}
            className="w-full bg-pink-500 text-white p-4 rounded-2xl font-bold hover:bg-pink-600 transition-all flex items-center justify-center gap-3 text-lg shadow-md shadow-pink-200 mt-4"
          >
            <LogIn size={24} />
            Entrar com o Google
          </button>
        </div>
      </div>
    );
  }

  // --- Funções Auxiliares do Calendário ---
  const [yearStr, monthStr] = currentDate.split('-');
  const viewYear = parseInt(yearStr, 10);
  const viewMonth = parseInt(monthStr, 10);
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const firstDayIndex = new Date(viewYear, viewMonth - 1, 1).getDay();
  const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

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
      
      {/* Aviso de Modo Leitura */}
      {isReadOnly && (
        <div className="max-w-7xl mx-auto mb-6 bg-blue-100 text-blue-700 p-3 rounded-2xl font-bold flex items-center justify-center gap-2 border-2 border-blue-200 shadow-sm">
          <Eye size={20} />
          Está no Modo de Visualização. Não é possível editar as horas.
        </div>
      )}

      {/* Header Fofo */}
      <div className="max-w-7xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-3">
          <div className="bg-pink-200 p-3 rounded-2xl text-pink-600 shadow-sm rotate-3">
            <Heart size={32} fill="currentColor" />
          </div>
          <div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Meu Diário de Horas</h1>
            <div className="flex items-center gap-2 mt-1">
              {!isReadOnly && syncStatus === 'synced' && <span className="flex items-center gap-1 text-emerald-500 font-bold text-xs bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"><Cloud size={14}/> Nuvem Ativa</span>}
              {!isReadOnly && syncStatus === 'syncing' && <span className="flex items-center gap-1 text-blue-500 font-bold text-xs bg-blue-50 px-2 py-1 rounded-lg border border-blue-100"><Cloud size={14} className="animate-pulse"/> A sincronizar...</span>}
              {!isReadOnly && syncStatus === 'error' && <span className="flex items-center gap-1 text-rose-500 font-bold text-xs bg-rose-50 px-2 py-1 rounded-lg border border-rose-100"><CloudOff size={14}/> Offline</span>}
              {isReadOnly && <span className="flex items-center gap-1 text-blue-500 font-bold text-xs bg-blue-50 px-2 py-1 rounded-lg border border-blue-100"><Eye size={14}/> Apenas Leitura</span>}
            </div>
          </div>
        </div>

        {/* Ações do Utilizador */}
        <div className="flex gap-2">
          {!isReadOnly && (
            <button 
              onClick={handleShare}
              className="bg-indigo-100 text-indigo-600 px-4 py-2 rounded-xl font-bold hover:bg-indigo-200 transition-colors flex items-center gap-2 text-sm shadow-sm"
            >
              <Share2 size={18} />
              Partilhar com Líder
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

      {/* Cards de Resumo */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <CardValue title="Saldo do Dia" value={minsToTime(dayBalance, true)} icon={Star} isPositive={dayBalance >= 0} neutral={dayBalance === 0}/>
        <CardValue title="Mês Acumulado" value={minsToTime(stats.monthBalance, true)} icon={Sun} isPositive={stats.monthBalance >= 0} neutral={stats.monthBalance === 0}/>
        <CardValue title="Ano Acumulado" value={minsToTime(stats.yearBalance, true)} icon={Briefcase} isPositive={stats.yearBalance >= 0} neutral={stats.yearBalance === 0}/>
      </div>

      {/* Layout Lado a Lado: Formulário e Calendário */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Coluna Esquerda: Formulário de Preenchimento */}
        <div className="lg:col-span-7">
          <div className="bg-white p-6 md:p-8 rounded-[2.5rem] shadow-sm border-2 border-purple-50">
            
            {/* Seletor de Data */}
            <div className="mb-8 bg-pink-50/50 border-2 border-pink-100 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <label className="text-sm font-bold text-pink-500 flex items-center gap-2">
                <Calendar size={20} /> Dia selecionado:
              </label>
              <input 
                type="date" 
                value={currentDate}
                onChange={(e) => setCurrentDate(e.target.value)}
                className="w-full md:w-auto bg-white border-2 border-pink-200 text-slate-800 text-lg p-2 px-4 rounded-xl font-bold focus:ring-4 focus:ring-pink-200 outline-none transition-all cursor-pointer"
              />
            </div>

            {/* Topo do Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Tipo de Dia</label>
                <select 
                  disabled={isReadOnly}
                  value={currentRecord.type}
                  onChange={(e) => updateField('type', e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-3 font-semibold text-slate-700 focus:border-pink-300 focus:ring-0 outline-none transition-colors disabled:opacity-60"
                >
                  <option value="Trabalho Normal">💼 Dia de Trabalho</option>
                  <option value="Fim de Semana">🛋️ Fim de Semana</option>
                  <option value="Folga (Banco)">🌴 Folga (Desconta Banco)</option>
                  <option value="Feriado">🎉 Feriado</option>
                  <option value="Atestado">🏥 Atestado Médico</option>
                  <option value="Falta">⚠️ Falta</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-slate-500 mb-2">Local de Trabalho</label>
                <div className="flex gap-2 bg-slate-50 p-1.5 rounded-2xl border-2 border-slate-100">
                  {['Home Office', 'Presencial'].map(model => (
                    <button
                      key={model}
                      disabled={isReadOnly}
                      onClick={() => updateField('workModel', model)}
                      className={`flex-1 py-2 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        currentRecord.workModel === model 
                          ? 'bg-white text-purple-600 shadow-sm' 
                          : 'text-slate-400 hover:text-slate-600'
                      } ${isReadOnly ? 'cursor-not-allowed opacity-80' : ''}`}
                    >
                      {model === 'Home Office' ? <Home size={16}/> : <Building size={16}/>}
                      {model}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Relógios */}
            <div className="bg-purple-50 rounded-3xl p-6 mb-8 border border-purple-100">
              <h3 className="font-bold text-purple-800 mb-4 flex items-center gap-2">
                <Clock size={20} /> Registo de Ponto
              </h3>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Chegada', field: 'timeIn', icon: '🌅' },
                  { label: 'Saída Almoço', field: 'lunchStart', icon: '🍲' },
                  { label: 'Volta Almoço', field: 'lunchEnd', icon: '☕' },
                  { label: 'Saída', field: 'timeOut', icon: '🌆' }
                ].map(item => (
                  <div key={item.field} className="flex flex-col gap-1">
                    <label className="text-xs font-bold text-purple-600/70 ml-2">{item.icon} {item.label}</label>
                    <input 
                      type="time" 
                      disabled={isReadOnly}
                      value={currentRecord[item.field]}
                      onChange={(e) => updateField(item.field, e.target.value)}
                      className="w-full bg-white border-2 border-purple-100 rounded-2xl p-3 font-bold text-purple-900 focus:border-purple-300 outline-none disabled:bg-purple-50 disabled:text-purple-600"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-6 flex items-center justify-between bg-white p-4 rounded-2xl text-sm border border-purple-100 font-bold text-purple-900">
                <span>Total trabalhado hoje:</span>
                <span className="text-xl bg-purple-100 px-3 py-1 rounded-xl">{minsToTime(workedMins)}</span>
              </div>
            </div>

            {/* Configurações do Dia */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
               <div className="bg-slate-50 p-5 rounded-3xl border-2 border-slate-100">
                 <label className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                   <AlertCircle size={18} className="text-slate-400"/> Meta do Dia
                 </label>
                 <input 
                    type="time" 
                    disabled={isReadOnly}
                    value={currentRecord.required}
                    onChange={(e) => updateField('required', e.target.value)}
                    className="w-full bg-white border-2 border-slate-200 rounded-xl p-2.5 font-bold text-slate-700 focus:border-pink-300 outline-none disabled:bg-slate-100"
                  />
               </div>

               <div className="bg-rose-50 p-5 rounded-3xl border-2 border-rose-100 flex flex-col">
                 <div className="flex items-center gap-2 mb-3">
                   <AlertCircle size={18} className="text-rose-500" />
                   <label className="text-sm font-bold text-rose-500 flex items-center gap-2 cursor-pointer select-none">
                     <input
                       type="checkbox"
                       disabled={isReadOnly}
                       checked={currentRecord.hasMedicalAbsence || false}
                       onChange={(e) => updateField('hasMedicalAbsence', e.target.checked)}
                       className="w-4 h-4 text-rose-500 rounded focus:ring-rose-400 border-rose-300 accent-rose-500 disabled:opacity-50"
                     />
                     Atestado Médico?
                   </label>
                 </div>

                 {currentRecord.hasMedicalAbsence && (
                   <div className="space-y-3 mt-1 flex-1">
                     <div>
                       <input 
                          type="time" 
                          disabled={isReadOnly}
                          value={currentRecord.medical}
                          onChange={(e) => updateField('medical', e.target.value)}
                          className="w-full bg-white border-2 border-rose-200 rounded-xl p-2.5 font-bold text-rose-700 focus:border-rose-400 outline-none disabled:bg-rose-50"
                        />
                     </div>
                     {currentRecord.medicalAttachment && (
                       <div className="flex items-center justify-between bg-white border-2 border-rose-200 rounded-xl p-2">
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
                       </div>
                     )}
                   </div>
                 )}
               </div>
            </div>

            {/* Entregas e Humor */}
            <div className="space-y-6">
              <div>
                <label className="text-sm font-bold text-slate-500 mb-3 flex items-center gap-2">
                  <Smile size={18} className="text-orange-400"/> Humor do dia
                </label>
                <div className="flex gap-3">
                  {['🤩', '🙂', '😐', '😫', '🤒'].map(emoji => (
                    <button
                      key={emoji}
                      disabled={isReadOnly}
                      onClick={() => updateField('mood', emoji)}
                      className={`text-3xl p-3 rounded-2xl transition-all ${
                        currentRecord.mood === emoji 
                          ? 'bg-orange-100 scale-110 shadow-sm' 
                          : 'opacity-50 grayscale'
                      } ${!isReadOnly && currentRecord.mood !== emoji ? 'hover:bg-slate-50 hover:grayscale-0' : ''}`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                  <FileText size={18} className="text-blue-400"/> Entregas concluídas
                </label>
                <textarea 
                  disabled={isReadOnly}
                  value={currentRecord.deliveries}
                  onChange={(e) => updateField('deliveries', e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[100px] text-slate-700 focus:border-blue-300 outline-none resize-none font-medium disabled:bg-slate-100"
                />
              </div>

              <div>
                <label className="text-sm font-bold text-slate-500 mb-2 flex items-center gap-2">
                  <BookOpen size={18} className="text-emerald-400"/> Observações
                </label>
                <textarea 
                  disabled={isReadOnly}
                  value={currentRecord.observations}
                  onChange={(e) => updateField('observations', e.target.value)}
                  className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 min-h-[80px] text-slate-700 focus:border-emerald-300 outline-none resize-none font-medium disabled:bg-slate-100"
                />
              </div>
            </div>

          </div>
        </div>

        {/* Coluna Direita: Visão Mensal (Calendário) */}
        <div className="lg:col-span-5 relative">
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

              {/* Seletor Rápido de Mês e Ano */}
              <div className="flex items-center gap-1 bg-indigo-50 p-1.5 rounded-2xl border-2 border-indigo-100 shadow-sm w-full justify-between">
                <button onClick={handlePrevMonth} className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all hover:shadow-sm">
                  <ChevronLeft size={20} />
                </button>
                <input
                  type="month"
                  value={`${viewYear}-${String(viewMonth).padStart(2, '0')}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split('-');
                    if (y && m) setCurrentDate(`${y}-${m}-01`);
                  }}
                  className="bg-transparent border-none text-indigo-800 font-bold text-lg p-2 text-center focus:ring-0 outline-none cursor-pointer uppercase w-full"
                />
                <button onClick={handleNextMonth} className="p-2 hover:bg-white rounded-xl text-indigo-600 transition-all hover:shadow-sm">
                  <ChevronRight size={20} />
                </button>
              </div>
            </div>

            {/* Grade do Calendário */}
            <div className="grid grid-cols-7 gap-1 md:gap-2 mb-6">
              {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(day => (
                <div key={day} className="text-center text-xs font-bold text-slate-400 py-1 uppercase tracking-wider">{day}</div>
              ))}
              
              {Array.from({ length: firstDayIndex }).map((_, i) => (<div key={`empty-${i}`} className="p-1" />))}
              
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dayNum = i + 1;
                const dateStr = `${viewYear}-${String(viewMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                const record = records[dateStr];
                
                const dateObj = new Date(viewYear, viewMonth - 1, dayNum);
                const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
                const config = record ? typeConfig[record.type] : (isWeekend ? typeConfig['Fim de Semana'] : null);
                
                const isSelected = dateStr === currentDate;

                return (
                  <button
                    key={dayNum}
                    onClick={() => setCurrentDate(dateStr)}
                    className={`flex flex-col items-center justify-center p-1 rounded-xl border-2 transition-all min-h-[3.5rem] md:min-h-[4.5rem] ${
                      isSelected ? 'ring-4 ring-pink-300 ring-offset-1 scale-105 z-10' : 'hover:scale-105'
                    } ${config ? config.color : 'bg-slate-50 border-slate-100 text-slate-400'}`}
                  >
                    <span className="font-extrabold text-xs md:text-sm">{dayNum}</span>
                    <span className="text-lg md:text-xl mt-0.5">{config ? config.icon : ''}</span>
                  </button>
                )
              })}
            </div>

            {/* Legenda */}
            <div className="bg-slate-50 p-3 md:p-4 rounded-2xl border-2 border-slate-100">
              <div className="flex flex-wrap gap-2">
                {Object.entries(typeConfig).map(([type, config]) => (
                  <div key={type} className={`flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-lg border-2 ${config.color}`}>
                    <span>{config.icon}</span> {type}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        
      </div>
    </div>
  );
}