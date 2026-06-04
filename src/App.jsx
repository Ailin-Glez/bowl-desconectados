import { BrowserRouter, Routes, Route } from 'react-router-dom'
import StageView from './views/StageView'
import AudienceView from './views/AudienceView'
import ShowView from './views/ShowView'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<StageView />} />
        <Route path="/p" element={<AudienceView />} />
        <Route path="/show" element={<ShowView />} />
      </Routes>
    </BrowserRouter>
  )
}
