import React, { useState, useEffect } from 'react';
import { X, User, Lock, LogIn, UserPlus, AlertCircle, CheckCircle, Wifi, WifiOff } from 'lucide-react';

const BACKEND_BASE_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:4000';

interface AuthPanelProps {
  onAuthSuccess: (username: string, token: string) => void;
}

type AuthMode = 'login' | 'register';

const AuthPanel: React.FC<AuthPanelProps> = ({ onAuthSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [backendConnected, setBackendConnected] = useState<boolean | null>(null);

  // 检查后端连接
  useEffect(() => {
    const checkBackend = async () => {
      try {
        const response = await fetch(`${BACKEND_BASE_URL}/api/health`, {
          method: 'GET',
          signal: AbortSignal.timeout(3000), // 3秒超时
        });
        if (response.ok) {
          setBackendConnected(true);
        } else {
          setBackendConnected(false);
        }
      } catch (err) {
        setBackendConnected(false);
      }
    };
    checkBackend();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    // 检查后端连接
    if (backendConnected === false) {
      setError(`无法连接到后端服务器 (${BACKEND_BASE_URL})。请确保后端服务正在运行。`);
      return;
    }

    if (!username.trim() || !password.trim()) {
      setError('请输入用户名和密码');
      return;
    }

    if (mode === 'register') {
      if (password !== confirmPassword) {
        setError('两次输入的密码不一致');
        return;
      }
      if (password.length < 6) {
        setError('密码长度至少为 6 个字符');
        return;
      }
      if (username.length < 3 || username.length > 20) {
        setError('用户名长度必须在 3-20 个字符之间');
        return;
      }
    }

    setIsLoading(true);

    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const response = await fetch(`${BACKEND_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      // 先只读一次 body（stream 只能读一次），再解析 JSON
      const text = await response.text();
      let data: Record<string, unknown>;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        setError(`服务器错误 (${response.status}): ${text || '无法解析响应'}`);
        setIsLoading(false);
        return;
      }

      if (!response.ok) {
        // 显示详细错误：优先用 message（如数据库具体错误），否则用 error
        const detail = data.message && data.message !== data.error ? `${data.error || '注册失败'}：${data.message}` : (data.error || data.message || `${mode === 'login' ? '登录' : '注册'}失败`);
        setError(detail);
        setIsLoading(false);
        return;
      }

      // 检查响应数据是否完整
      if (!data.username || !data.token) {
        setError('服务器响应不完整，请重试');
        setIsLoading(false);
        return;
      }

      // 保存认证信息
      localStorage.setItem('GENMON_USERNAME', data.username);
      localStorage.setItem('GENMON_AUTH_TOKEN', data.token);
      localStorage.setItem('GENMON_USER_ID', String(data.userId || ''));
      localStorage.setItem('GENMON_IS_ADMIN', (mode === 'login' && data.isAdmin) ? 'true' : 'false');

      setSuccess(`${mode === 'login' ? '登录' : '注册'}成功！`);
      
      // 延迟一下再调用回调，让用户看到成功消息
      setTimeout(() => {
        onAuthSuccess(data.username, data.token);
      }, 500);
    } catch (err: any) {
      // 网络错误或其他错误
      console.error('Auth error:', err);
      if (err.message && err.message.includes('Failed to fetch')) {
        setError(`无法连接到服务器 (${BACKEND_BASE_URL})。请确保后端服务正在运行。`);
      } else {
        setError(`网络错误：${err.message || '无法连接到服务器'}`);
      }
      setIsLoading(false);
    }
  };

  const switchMode = () => {
    setMode(mode === 'login' ? 'register' : 'login');
    setError(null);
    setSuccess(null);
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-[fadeIn_0.2s_ease-out]">
      <div className="relative max-w-md w-full">
        {/* 渐变边框效果 */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-0.5 rounded-2xl bg-gradient-to-br from-emerald-400/40 via-cyan-500/25 to-purple-500/40 opacity-80 blur-xl"
        />
        
        {/* 主容器 */}
        <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-slate-900/95 via-slate-950/95 to-slate-900/95 shadow-[0_24px_80px_rgba(0,0,0,0.9)]">
          {/* 头部 */}
          <div className="px-6 pt-6 pb-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 via-cyan-400 to-purple-400 bg-clip-text text-transparent">
                {mode === 'login' ? '登录游戏' : '创建账号'}
              </h2>
              {/* 后端连接状态指示器 */}
              {backendConnected !== null && (
                <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs ${
                  backendConnected 
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                }`}>
                  {backendConnected ? (
                    <>
                      <Wifi className="h-3 w-3" />
                      <span>已连接</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="h-3 w-3" />
                      <span>未连接</span>
                    </>
                  )}
                </div>
              )}
            </div>
            <p className="text-sm text-gray-400">
              {mode === 'login'
                ? '请输入您的账号信息以继续游戏'
                : '创建新账号以开始您的冒险之旅'}
            </p>
            {backendConnected === false && (
              <div className="mt-2 flex items-center gap-2 text-xs text-red-400">
                <AlertCircle className="h-3 w-3" />
                <span>无法连接到后端服务器 ({BACKEND_BASE_URL})，请确保后端服务正在运行</span>
              </div>
            )}
          </div>

          {/* 表单内容 */}
          <div className="px-6 pt-5 pb-6">
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 用户名输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  用户名
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                    placeholder="请输入用户名"
                    disabled={isLoading}
                    autoFocus
                  />
                </div>
              </div>

              {/* 密码输入 */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  密码
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                    placeholder="请输入密码"
                    disabled={isLoading}
                  />
                </div>
              </div>

              {/* 确认密码（仅注册模式） */}
              {mode === 'register' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    确认密码
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-800/50 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500/50 transition-all"
                      placeholder="请再次输入密码"
                      disabled={isLoading}
                    />
                  </div>
                </div>
              )}

              {/* 错误/成功消息 */}
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {success && (
                <div className="flex items-center gap-2 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-emerald-400 text-sm">
                  <CheckCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{success}</span>
                </div>
              )}

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-gradient-to-r from-emerald-500 via-cyan-500 to-purple-500 hover:from-emerald-600 hover:via-cyan-600 hover:to-purple-600 text-white font-semibold rounded-lg shadow-lg shadow-emerald-500/25 transition-all transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>处理中...</span>
                  </>
                ) : (
                  <>
                    {mode === 'login' ? (
                      <>
                        <LogIn className="h-5 w-5" />
                        <span>登录</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="h-5 w-5" />
                        <span>注册</span>
                      </>
                    )}
                  </>
                )}
              </button>
            </form>

            {/* 切换模式 */}
            <div className="mt-4 pt-4 border-t border-white/10">
              <button
                onClick={switchMode}
                disabled={isLoading}
                className="w-full text-sm text-gray-400 hover:text-emerald-400 transition-colors disabled:opacity-50"
              >
                {mode === 'login' ? (
                  <>还没有账号？<span className="font-semibold text-emerald-400">立即注册</span></>
                ) : (
                  <>已有账号？<span className="font-semibold text-emerald-400">立即登录</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPanel;
