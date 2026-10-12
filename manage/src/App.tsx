import { BrowserRouter } from 'react-router-dom'
import AppRouter from './router'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'

function App() {
  return (
    <ConfigProvider locale={zhCN}>
      <BrowserRouter basename="/bpManage">
        <AppRouter />
      </BrowserRouter>
    </ConfigProvider>
  )
}

export default App
