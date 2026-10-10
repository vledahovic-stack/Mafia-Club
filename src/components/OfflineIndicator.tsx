import React from 'react';
import { WifiOff, RefreshCw } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-amber-950/95 border border-amber-600/80 text-amber-200 text-xs shadow-2xl backdrop-blur-md animate-in fade-in slide-in-from-bottom-2">
      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-ping shrink-0" />
      <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
      <div className="flex items-center gap-2">
        <span className="font-semibold">Автономный режим (Офлайн)</span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="p-1 rounded hover:bg-amber-900/60 transition-colors text-amber-300"
          title="Повторить подключение"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
