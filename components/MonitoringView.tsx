import React, { useState } from 'react';
import { TrackingTask, Platform, TaskStatus } from '../types';
import { Play, Clock, Check, Plus, Trash2, Calendar, Activity, Loader2 } from './Icons';

interface MonitoringViewProps {
  tasks: TrackingTask[];
  onAddTask: (task: TrackingTask) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({ tasks, onAddTask }) => {
  const [isCreating, setIsCreating] = useState(false);
  
  // Form State
  const [keywords, setKeywords] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<Platform[]>([Platform.Twitter]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const handleCreate = () => {
    if(!keywords || !startDate || !endDate) return;

    const newTask: TrackingTask = {
      id: Date.now().toString(),
      keywords,
      platforms: selectedPlatforms,
      dateRange: { start: startDate, end: endDate },
      status: TaskStatus.Running,
      itemsFound: 0,
      lastRun: 'Starting...'
    };
    onAddTask(newTask);
    setIsCreating(false);
    setKeywords('');
  };

  const togglePlatform = (p: Platform) => {
    setSelectedPlatforms(prev => 
      prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]
    );
  };

  return (
    <div className="flex flex-col h-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-gray-100 flex items-center justify-between">
        <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Activity className="text-indigo-600" />
                Monitoring Console
            </h2>
            <p className="text-sm text-gray-500 mt-1">Configure active crawlers and content tracking tasks.</p>
        </div>
        <button 
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
            <Plus size={18} />
            New Tracker
        </button>
      </div>

      {/* Content */}
      <div className="p-6 bg-gray-50 flex-1 overflow-y-auto">
        
        {/* Creation Form */}
        {isCreating && (
            <div className="bg-white p-6 rounded-xl border border-indigo-100 shadow-sm mb-6 animate-in slide-in-from-top-4">
                <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">Define New Task</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Keywords / Topic</label>
                        <input 
                            type="text" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="e.g. 'Claude 3.5' or 'Gen-3 Alpha'"
                            value={keywords}
                            onChange={(e) => setKeywords(e.target.value)}
                        />
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Platforms</label>
                        <div className="flex gap-3">
                            {[Platform.Twitter, Platform.Xiaohongshu].map(p => (
                                <button
                                    key={p}
                                    onClick={() => togglePlatform(p)}
                                    className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors ${selectedPlatforms.includes(p) ? 'bg-indigo-50 border-indigo-500 text-indigo-700' : 'bg-white border-gray-200 text-gray-600'}`}
                                >
                                    {p}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                        <input 
                            type="date" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={startDate}
                            onChange={(e) => setStartDate(e.target.value)}
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                        <input 
                            type="date" 
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={endDate}
                            onChange={(e) => setEndDate(e.target.value)}
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3">
                    <button 
                        onClick={() => setIsCreating(false)}
                        className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                    >
                        Cancel
                    </button>
                    <button 
                        onClick={handleCreate}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium"
                    >
                        Start Tracking
                    </button>
                </div>
            </div>
        )}

        {/* Task List */}
        <div className="space-y-4">
            {tasks.map(task => (
                <div key={task.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between hover:shadow-md transition-shadow">
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${task.status === TaskStatus.Running ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            {task.status === TaskStatus.Running ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />}
                        </div>
                        <div>
                            <h4 className="font-semibold text-gray-900">{task.keywords}</h4>
                            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                                <span className="flex items-center gap-1"><Calendar size={12} /> {task.dateRange.start} - {task.dateRange.end}</span>
                                <span className="flex items-center gap-1">|</span>
                                <span>{task.platforms.join(', ')}</span>
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-8">
                        <div className="text-right">
                            <div className="text-xs text-gray-500">Items Found</div>
                            <div className="font-bold text-gray-900 text-lg">{task.itemsFound}</div>
                        </div>
                        <div className="text-right hidden sm:block">
                            <div className="text-xs text-gray-500">Last Run</div>
                            <div className="text-gray-700 text-sm">{task.lastRun}</div>
                        </div>
                        <div className="flex items-center gap-2">
                             {task.status === TaskStatus.Completed && (
                                <button className="px-3 py-1.5 bg-indigo-50 text-indigo-700 text-sm font-medium rounded-lg hover:bg-indigo-100">
                                    Review
                                </button>
                             )}
                             <button className="p-2 text-gray-400 hover:text-red-500 transition-colors">
                                <Trash2 size={18} />
                             </button>
                        </div>
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
};