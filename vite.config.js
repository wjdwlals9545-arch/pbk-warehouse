import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/pbk-warehouse/',
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            // React 코어 (필수, 가장 먼저 로딩)
            if (id.includes('/react-dom/') || id.includes('/react/')) {
              return 'react-vendor';
            }
            // 차트 라이브러리 + D3 의존성 (차트 탭에서만 사용)
            if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) {
              return 'recharts';
            }
            // 아이콘 라이브러리
            if (id.includes('lucide-react')) {
              return 'lucide';
            }
            // PDF 내보내기 (가끔 사용)
            if (id.includes('jspdf') || id.includes('html2canvas')) {
              return 'pdf-export';
            }
          }
        },
      },
    },
  },
})
