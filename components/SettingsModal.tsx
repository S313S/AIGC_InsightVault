import React, { useState } from 'react';
import { X, User, Mail, CreditCard, Bell, Shield, LogOut, Camera, Check, Sparkles } from './Icons';

interface UserProfile {
  name: string;
  email: string;
  plan: string;
  avatar: string;
}

interface SettingsModalProps {
  user: UserProfile;
  onClose: () => void;
  onUpdate: (user: UserProfile) => void;
}

type Tab = 'profile' | 'billing' | 'notifications';

export const SettingsModal: React.FC<SettingsModalProps> = ({ user, onClose, onUpdate }) => {
  const [activeTab, setActiveTab] = useState<Tab>('profile');
  const [formData, setFormData] = useState(user);
  const [isSaved, setIsSaved] = useState(false);

  const handleSave = () => {
    onUpdate(formData);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose}></div>
      
      <div className="relative bg-white rounded-2xl w-full max-w-4xl h-[80vh] overflow-hidden shadow-2xl flex flex-col md:flex-row animate-in zoom-in-95 duration-200">
        
        {/* Sidebar */}
        <div className="w-full md:w-64 bg-gray-50 border-r border-gray-100 p-6 flex flex-col justify-between">
            <div>
                <h2 className="text-xl font-bold text-gray-900 mb-6">Settings</h2>
                <nav className="space-y-1">
                    <button 
                        onClick={() => setActiveTab('profile')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'profile' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <User size={18} /> My Profile
                    </button>
                    <button 
                         onClick={() => setActiveTab('billing')}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === 'billing' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
                    >
                        <CreditCard size={18} /> Plan & Billing
                    </button>
