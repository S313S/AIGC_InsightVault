import React, { useState } from 'react';

import { Loader2, Shield, X } from './Icons';

interface LoginModalProps {
  onClose: () => void;
  onSubmit: (username: string, password: string) => Promise<string | null>;
}

export const LoginModal: React.FC<LoginModalProps> = ({ onClose, onSubmit }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError('');

    try {
      const nextError = await onSubmit(username, password);
      if (nextError) {
        setError(nextError);
        return;
      }
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose}></div>
      <div className="relative w-full max-w-md rounded-2xl border border-[#1e3a5f]/50 bg-[#0d1526]/95 shadow-2xl backdrop-blur-xl">
        <div className="flex items-center justify-between border-b border-[#1e3a5f]/40 p-4">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-indigo-500/20 p-2 text-indigo-300">
              <Shield size={18} />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-100">登录账号</h2>
              <p className="text-xs text-gray-500">登录后才能新增、编辑和管理你的数据。</p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-2 text-gray-500 hover:bg-white/5 hover:text-gray-300">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">账号名</label>
            <input
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              placeholder="例如：xiaoci"
              className="w-full rounded-lg border border-[#1e3a5f]/50 bg-[#0a0f1a] px-3 py-2 text-sm text-gray-100 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-300">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSubmit();
              }}
              className="w-full rounded-lg border border-[#1e3a5f]/50 bg-[#0a0f1a] px-3 py-2 text-sm text-gray-100 outline-none transition-all focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting && <Loader2 size={16} className="animate-spin" />}
            登录
          </button>
        </div>
      </div>
    </div>
  );
};
