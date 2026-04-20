"use client";

import { useState, useEffect } from 'react';
import { Megaphone, X } from 'lucide-react';

export default function NeighborBusinessPopup() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Check localStorage
    const hideDate = localStorage.getItem('hideNeighborBizPopup');
    const today = new Date().toDateString();
    
    if (hideDate !== today) {
      // Show popup after a short delay
      const timer = setTimeout(() => {
        setIsVisible(true);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleClose = () => {
    setIsVisible(false);
  };

  const handleHideToday = () => {
    const today = new Date().toDateString();
    localStorage.setItem('hideNeighborBizPopup', today);
    setIsVisible(false);
  };

  const openAndroid = () => {
    const storeUrlAndroid = 'https://play.google.com/store/apps/details?id=com.yourname.chaovnapp';
    const ua = navigator.userAgent || '';
    const isAndroid = /Android/i.test(ua);
    
    if (isAndroid) {
        const intentUrl = `intent://neighborbiz#Intent;scheme=chaovietnam;package=com.yourname.chaovnapp;S.browser_fallback_url=${encodeURIComponent(storeUrlAndroid)};end`;
        window.location.href = intentUrl;
    } else {
        window.open(storeUrlAndroid, '_blank');
    }
    handleClose();
  };

  const openIOS = () => {
    const storeUrlIOS = 'https://apps.apple.com/us/app/id6754750793';
    const ua = navigator.userAgent || '';
    const isIOS = /iPhone|iPad|iPod/i.test(ua);
    
    if (isIOS) {
        window.location.href = `chaovietnam://neighborbiz`;
        setTimeout(() => {
             window.location.href = storeUrlIOS;
        }, 1500);
    } else {
        window.open(storeUrlIOS, '_blank');
    }
    handleClose();
  };

  const openInWeb = () => {
    window.open('https://www.vnkorlife.com/neighborbusiness', '_blank');
    handleClose();
  };

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-10 bg-black/75 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border-2 border-orange-100 flex flex-col max-h-[90vh]">
        
        {/* Header Gradient Banner */}
        <div className="bg-gradient-to-br from-[#FF6B35] via-[#ff8c42] to-[#FFA751] px-6 py-10 md:py-14 text-center relative shrink-0">
          <button 
            onClick={handleClose} 
            className="absolute top-4 right-4 text-white hover:text-gray-200 transition-transform hover:scale-110 focus:outline-none bg-black/20 p-2 rounded-full cursor-pointer"
            aria-label="닫기"
          >
            <X size={24} />
          </button>
          
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl p-2">
            <img src="/logo.png" alt="Xinchao Logo" className="w-full h-full object-contain" />
          </div>
          
          <h2 className="text-3xl md:text-5xl font-black text-white mb-2 md:mb-4 tracking-tighter drop-shadow-md">
            씬짜오베트남에서 알립니다
          </h2>
          <div className="inline-block bg-yellow-400 text-orange-900 px-4 py-1.5 md:px-6 md:py-2 rounded-full font-black text-lg md:text-2xl shadow-sm transform -rotate-1">
            ✨ 새로운 서비스 출현! ✨
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-10 text-center bg-gray-50 shrink-0 overflow-y-auto">
          <p className="text-2xl md:text-3xl text-gray-800 font-bold mb-4 leading-tight tracking-tight">
            우리 지역 소식을 한눈에!<br className="hidden md:block"/>
            <span className="text-[#FF6B35] text-3xl md:text-4xl font-black ml-2 inline-block mt-2">"이웃사업 안내"</span>
          </p>
          
          <p className="text-base md:text-xl text-gray-600 mb-8 md:mb-12 leading-relaxed max-w-xl mx-auto font-medium">
            우리 이웃의 신제품, 파격 이벤트부터 동네 업소들의<br className="hidden md:block"/>
            생생한 소식까지 씬짜오 앱에서 가장 먼저 만나보세요.
          </p>

          <div className="flex flex-col items-center justify-center space-y-6 max-w-md mx-auto">
            {/* Install Buttons Row */}
            <div className="flex flex-col sm:flex-row w-full gap-4">
              {/* Android Button */}
              <button 
                onClick={openAndroid}
                className="cursor-pointer relative flex-1 rounded-2xl bg-[#3DDC84] hover:bg-[#34c073] text-white font-black text-lg py-5 px-4 transition-all transform active:translate-y-[6px] active:shadow-none shadow-[0_6px_0_0_#2b9f5f] focus:outline-none flex flex-col items-center justify-center group"
              >
                <div className="flex items-center justify-center h-8 mb-1">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M17.523 15.3414c-.0611-.5322.2599-1.0264.762-1.1738l2.6074-.7662c.3075-.0904.3826-.4993.1118-.6968l-3.3283-2.427a1.0001 1.0001 0 0 0-1.2582-.058L14.0754 11.838A1.999 1.999 0 0 0 12.5 11c-1.1046 0-2 .8954-2 2s.8954 2 2 2c.6225 0 1.178-.2861 1.545-.7336l2.1963-1.4642.1468.107-.6397 2.1764c-.1398.4754-.0477 1.002.2458 1.3962l2.0016 2.6896c.2195.295.6698.2434.8213-.0939zM8.5 15c-1.6569 0-3 1.3431-3 3 0 1.6569 1.3431 3 3 3s3-1.3431 3-3c0-1.6569-1.3431-3-3-3zM4.195 9.0706A8.9959 8.9959 0 0 0 3 14c0 3.993 2.606 7.375 6.262 8.583a4.978 4.978 0 0 1-4.262-4.583H3C3 13.9118 6.0022 10.4907 9.8776 9.206L8.5303 7.8586A.9996.9996 0 0 1 9.9445 6.4444zM16 3H8C5.2386 3 3 5.2386 3 8v.5c0 2.2091-1.7909 4-4 4v2c2.2091 0 4 1.7909 4 4v.5c0 2.7614 2.2386 5 5 5h8c2.7614 0 5-2.2386 5-5v-.5c0-2.2091 1.7909-4 4-4v-2c-2.2091 0-4-1.7909-4-4V8c0-2.7614-2.2386-5-5-5zm-5 13c-1.1046 0-2 .8954-2 2H7v-2h4zm0-9h-1V5h1v2zm4 0h-1V5h1v2z"/></svg>
                </div>
                <span>Android 앱 설치</span>
                <div className="absolute -top-3 -right-2 bg-red-500 text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-md animate-bounce">
                  Google Play
                </div>
              </button>
              
              {/* iOS Button */}
              <button 
                onClick={openIOS}
                className="cursor-pointer relative flex-1 rounded-2xl bg-[#000000] hover:bg-[#333333] text-white font-black text-lg py-5 px-4 transition-all transform active:translate-y-[6px] active:shadow-none shadow-[0_6px_0_0_#000000] focus:outline-none flex flex-col items-center justify-center group"
              >
                <div className="flex items-center justify-center h-8 mb-1">
                  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.4771 2 2 6.4771 2 12s4.4771 10 10 10 10-4.4771 10-10S17.5228 2 12 2zm3.636 14.156c-.347.169-.475.45-.487.644-.025.334.225.592.548.592.112 0 .23-.035.338-.1l1.52-1.025a.8.8 0 0 0 .363-.679V10.22c0-.39-.32-.71-.715-.71H14.12c-.394 0-.714.32-.714.71v.834h2.51v3.313a1.595 1.595 0 0 1-1.104 1.523l-.116.035c-.255.074-.536.08-.82.02v.006c-.664-.138-1.174-.698-1.218-1.385l-.004-.085H10.15l-.01.127c-.01.16-.022.253-.022.253-.048.33-.217.618-.466.804l-.063.04v.002a1.56 1.56 0 0 1-.952.32c-.856 0-1.554-.69-1.554-1.536V10.332h2.518V9.5h-2.52V7H6v3.22c0 1.258.946 2.3 2.188 2.443.344.032.613.14.797.316.29.28.397.687.278 1.077l-.022.062 1.488 1.042c.112.068.232.106.346.106.33 0 .584-.265.556-.605-.015-.2-.146-.484-.492-.66L11.5 14v1.898c0 1.26.963 2.3 2.196 2.45h.001c1.085.122 2.05-.536 2.378-1.465a3.197 3.197 0 0 0 3.018-3.08v-3.585h1v4.743l-4.457 2.35zM9.482 10.333c0-.462.378-.838.847-.838.468 0 .848.376.848.838v.67h-1.695v-.67zm2.59-1.61c-.512.42-1.173.673-1.892.673-.772 0-1.472-.284-1.997-.75l-.001-.001C7.727 8.243 7.42 7.643 7.42 6.98 7.42 5.334 8.766 4 10.428 4c1.662 0 3.008 1.334 3.008 2.98 0 .58-.168 1.123-.464 1.57h-.002v.002H13v.001A3.011 3.011 0 0 1 12.072 8.723zM10.43 5.49c-.83 0-1.504.664-1.504 1.482s.674 1.48 1.504 1.48c.83 0 1.504-.662 1.504-1.48s-.674-1.482-1.504-1.482z"/></svg>
                </div>
                <span>iOS 앱 설치</span>
                <div className="absolute -top-3 -right-2 bg-blue-500 text-white text-[11px] font-extrabold px-2.5 py-0.5 rounded-full shadow-md animate-bounce" style={{animationDelay: '0.2s'}}>
                  App Store
                </div>
              </button>
            </div>
            
            <button 
              onClick={openInWeb}
              className="cursor-pointer w-full py-4 px-4 text-gray-500 hover:text-gray-800 font-bold text-base transition-colors focus:outline-none flex items-center justify-center gap-2 underline underline-offset-4 decoration-2 decoration-gray-300 hover:decoration-gray-500 mt-2"
            >
              웹 브라우저로 접속하기
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="flex border-t border-gray-200 bg-white mt-auto shrink-0">
          <button 
            onClick={handleHideToday}
            className="cursor-pointer flex-1 py-4 text-base font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors border-r border-gray-100 focus:outline-none"
          >
            오늘 하루 그만 보기
          </button>
          <button 
            onClick={handleClose}
            className="cursor-pointer flex-1 py-4 text-base font-medium text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors focus:outline-none"
          >
            오늘은 닫기
          </button>
        </div>
      </div>
    </div>
  );
}
