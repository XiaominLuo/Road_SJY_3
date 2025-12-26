
import React, { useState, useEffect } from 'react';
import { X, Mail, Lock, User as UserIcon, Loader2, ArrowRight, KeyRound, Eye, EyeOff, HelpCircle } from 'lucide-react';
import { User } from '../types';
import { api } from '../services/apiService';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: User) => void;
}

type AuthMode = 'login' | 'register' | 'forgot-password';

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onLoginSuccess }) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [isLoading, setIsLoading] = useState(false);

  // Form States
  const [loginInput, setLoginInput] = useState(''); // For Login: Username or Email
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  // Added logid state to store the ID returned from sending verification code
  const [logid, setLogid] = useState('');
  
  // UI States
  const [showPassword, setShowPassword] = useState(false);
  
  // Verification Code States
  const [isCodeSending, setIsCodeSending] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // Timer Effect
  useEffect(() => {
    if (countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [countdown]);

  // Reset states when mode changes
  useEffect(() => {
    if (!isOpen) return;
    setVerificationCode('');
    setLogid('');
    setCountdown(0);
  }, [mode, isOpen]);

  if (!isOpen) return null;

  const handleSendCode = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!email) {
      alert("请先输入邮箱地址");
      return;
    }
    if (!email.includes('@')) {
      alert("请输入有效的邮箱地址");
      return;
    }
    
    setIsCodeSending(true);
    try {
        let response;
        if (mode === 'register') {
            // 注册验证码接口
            response = await api.sendRegisterCode(email);
        } else if (mode === 'forgot-password') {
            // 修改密码验证码接口
            response = await api.sendForgotPasswordCode(email);
        }
        
        // Store logid if present
        if (response && response.logid) {
            setLogid(response.logid);
        }

        setCountdown(60);
        const actionText = mode === 'register' ? '注册验证码' : '重置验证码';
        alert(`${actionText}已发送至 ${email}，请查收`);
    } catch (error: any) {
        alert(error.message);
    } finally {
        setIsCodeSending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // --- Login Mode ---
    if (mode === 'login') {
        if (!loginInput) {
            alert("请输入用户名或邮箱");
            return;
        }
        if (!password) {
            alert("请输入密码");
            return;
        }

        setIsLoading(true);
        try {
            const user = await api.login(loginInput, password);
            onLoginSuccess(user);
        } catch (error: any) {
            alert(`登录失败: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    }
    
    // --- Register Mode ---
    else if (mode === 'register') {
        // Validate Username: Length 1-30, Letters + Numbers only
        if (!nickname) {
            alert("请输入用户名称");
            return;
        }
        // Regex to match API constraint: Only letters and numbers
        const usernameRegex = /^[a-zA-Z0-9]+$/;
        if (!usernameRegex.test(nickname)) {
            alert("用户名仅支持字母和数字");
            return;
        }
        if (nickname.length > 30) {
            alert("用户名长度不能超过30个字符");
            return;
        }

        if (!email.includes('@')) {
          alert("请输入有效的邮箱地址");
          return;
        }
        
        // Validate Captcha: 6 chars
        if (!verificationCode) {
            alert("请输入邮箱验证码");
            return;
        }
        if (verificationCode.length !== 6) {
             alert("请输入6位验证码");
             return;
        }

        // Validate Password: 6-50 chars
        if (password.length < 6) {
          alert("密码长度至少需6位");
          return;
        }
        if (password.length > 50) {
            alert("密码长度不能超过50位");
            return;
        }

        setIsLoading(true);
        
        try {
            // 1. 调用 api.register (对应后端 /api/v1/user/create)
            try {
               await api.register(email, password, nickname, verificationCode, logid);
            } catch (regError: any) {
               // Special handling: If backend creates user but complains about missing data or other soft errors,
               // we assume the account MIGHT have been created or exists, and try to login.
               // Check specifically for "返回数据缺少用户信息" or similar variations
               if (regError.message && (regError.message.includes('缺少用户信息') || regError.message.includes('User exists'))) {
                   console.warn("Registration partial error/exists:", regError);
                   // Proceed to manual login prompt
                   throw new Error("AUTO_LOGIN_REQUIRED");
               }
               throw regError; // Rethrow real errors
            }
            
            // 2. Alert Success immediately (Optimistic UI)
            // If we are here, register (code=0) succeeded.
            // Try auto login.
            try {
                const user = await api.login(email, password);
                onLoginSuccess(user);
                return; // Exit if successful
            } catch (loginError) {
                console.warn("Auto-login failed after success register:", loginError);
                // If auto login fails, fall through to manual login prompt
                throw new Error("AUTO_LOGIN_REQUIRED");
            }

        } catch (error: any) {
            if (error.message === "AUTO_LOGIN_REQUIRED") {
                // Determine message based on context
                alert("注册/验证成功！请直接登录。");
                
                // Switch to login mode and pre-fill
                setMode('login');
                setLoginInput(email); // Pre-fill email
                setPassword(password); // Pre-fill password (convenience)
            } else {
                alert(`注册失败: ${error.message}`);
            }
        } finally {
            setIsLoading(false);
        }
    }

    // --- Forgot Password Mode ---
    else if (mode === 'forgot-password') {
       if (!email.includes('@')) {
          alert("请输入有效的邮箱地址");
          return;
       }
       if (!verificationCode) {
           alert("请输入邮箱验证码");
           return;
       }
       if (password.length < 6) {
           alert("新密码长度至少需6位");
           return;
       }

       setIsLoading(true);
       try {
           // 调用修改密码接口
           await api.resetPassword(email, password, verificationCode, logid);
           alert("密码重置成功！请使用新密码登录。");
           setMode('login');
           setLoginInput(email);
           setPassword('');
       } catch (error: any) {
           alert(`重置失败: ${error.message}`);
       } finally {
           setIsLoading(false);
       }
    }
  };

  const getTitle = () => {
      if (mode === 'login') return '欢迎回来';
      if (mode === 'register') return '注册账号';
      if (mode === 'forgot-password') return '重置密码';
  };

  const getSubtitle = () => {
      if (mode === 'login') return '使用用户名或邮箱登录';
      if (mode === 'register') return '加入 RoadFinder，共建数字地球';
      if (mode === 'forgot-password') return '验证邮箱以设置新密码';
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-300 border border-slate-100">
        
        {/* Decorative Header Background */}
        <div className="absolute top-0 left-0 w-full h-32 bg-emerald-50 overflow-hidden pointer-events-none">
           <div className="absolute top-[-50%] right-[-20%] w-64 h-64 bg-emerald-100/50 rounded-full blur-3xl"></div>
           <div className="absolute top-[-20%] left-[-20%] w-48 h-48 bg-teal-100/50 rounded-full blur-3xl"></div>
        </div>

        {/* Close Button */}
        <button 
          onClick={onClose}
          type="button"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white/50 hover:bg-white rounded-full p-1 transition-all z-[100] cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header Content */}
        <div className="relative p-8 pb-4 text-center z-10">
          <div className="inline-flex p-3 bg-white rounded-2xl shadow-sm mb-4">
              {mode === 'forgot-password' ? (
                  <KeyRound className="w-6 h-6 text-emerald-600" />
              ) : (
                  <UserIcon className="w-6 h-6 text-emerald-600" />
              )}
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-1">
            {getTitle()}
          </h2>
          <p className="text-slate-500 text-sm">
            {getSubtitle()}
          </p>
        </div>

        {/* Body */}
        <div className="p-8 pt-2">
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* 1. Login Identifier (Login Mode Only) */}
            {mode === 'login' && (
                <div className="space-y-1 animate-in slide-in-from-top duration-300">
                <label className="text-xs font-bold text-slate-500 ml-1">账号</label>
                <div className="relative">
                    <UserIcon className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                    <input 
                    type="text" 
                    required
                    value={loginInput}
                    onChange={e => setLoginInput(e.target.value)}
                    placeholder="请输入用户名或邮箱"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
                    />
                </div>
                </div>
            )}

            {/* 2. Nickname (Register Mode Only) */}
            {mode === 'register' && (
              <div className="space-y-1 animate-in slide-in-from-top duration-300">
                <label className="text-xs font-bold text-slate-500 ml-1">用户名称</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="text" 
                    required={mode === 'register'}
                    value={nickname}
                    onChange={e => setNickname(e.target.value)}
                    placeholder="仅支持字母+数字"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
                  />
                </div>
                <p className="text-[10px] text-slate-400 ml-1">长度1-30位，仅支持字母或数字</p>
              </div>
            )}

            {/* 3. Email (Register & Forgot Password) */}
            {(mode === 'register' || mode === 'forgot-password') && (
              <div className="space-y-1 animate-in slide-in-from-top duration-300">
                <label className="text-xs font-bold text-slate-500 ml-1">电子邮箱</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <input 
                    type="email" 
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@example.com"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
                  />
                </div>
              </div>
            )}

            {/* 4. Verification Code (Register & Forgot Password) */}
            {(mode === 'register' || mode === 'forgot-password') && (
              <div className="space-y-1 animate-in slide-in-from-top duration-300">
                <label className="text-xs font-bold text-slate-500 ml-1">验证码</label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <KeyRound className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      required
                      value={verificationCode}
                      onChange={e => setVerificationCode(e.target.value)}
                      placeholder="6位验证码"
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-4 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={isCodeSending || countdown > 0}
                    className="px-4 py-2 bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border border-slate-200 rounded-xl text-xs font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed min-w-[100px] flex items-center justify-center"
                  >
                    {isCodeSending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : countdown > 0 ? (
                      `${countdown}s`
                    ) : (
                      '获取验证码'
                    )}
                  </button>
                </div>
              </div>
            )}

            {/* 5. Password (All Modes) */}
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-500 ml-1">
                  {mode === 'forgot-password' ? '设置新密码' : '密码'}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                <input 
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={mode === 'forgot-password' ? "请输入新密码" : "••••••••"}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pl-10 pr-10 text-slate-900 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all placeholder:text-slate-400 font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3.5 text-slate-400 hover:text-slate-600 focus:outline-none transition-colors"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              
              {/* Forgot Password Link (Login Mode Only) */}
              {mode === 'login' && (
                  <div className="flex justify-end pt-1">
                      <button 
                        type="button"
                        onClick={() => {
                            setMode('forgot-password');
                            setVerificationCode('');
                            setEmail('');
                            setLogid('');
                        }}
                        className="text-xs text-slate-400 hover:text-emerald-600 transition-colors flex items-center gap-1 font-medium"
                      >
                          <HelpCircle className="w-3 h-3" />
                          忘记密码？
                      </button>
                  </div>
              )}
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-xl shadow-xl shadow-emerald-600/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                 <>
                   {mode === 'login' && '立即登录'}
                   {mode === 'register' && '完成注册'}
                   {mode === 'forgot-password' && '确认重置'}
                   <ArrowRight className="w-4 h-4" />
                 </>
              )}
            </button>
          </form>

          {/* Footer Toggle */}
          <div className="mt-6 text-center">
            {mode === 'forgot-password' ? (
                <button 
                type="button"
                onClick={() => setMode('login')}
                className="text-slate-500 hover:text-slate-800 text-sm transition-colors font-medium"
              >
                想起密码了？ 
                <span className="text-emerald-600 font-bold ml-1">
                  返回登录
                </span>
              </button>
            ) : (
                <button 
                type="button"
                onClick={() => {
                    setMode(mode === 'login' ? 'register' : 'login');
                    setVerificationCode('');
                    setLogid('');
                    setCountdown(0);
                    setEmail('');
                }}
                className="text-slate-500 hover:text-slate-800 text-sm transition-colors font-medium"
              >
                {mode === 'login' ? '还没有账号？' : '已有账号？'} 
                <span className="text-emerald-600 font-bold ml-1">
                  {mode === 'login' ? '点击注册' : '直接登录'}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
