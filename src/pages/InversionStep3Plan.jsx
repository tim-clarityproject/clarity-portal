import { Navigate, useLocation } from 'react-router-dom';

// The Pre-mortem is one guided tool at /pre-mortem since Draft 6 (Polish 1,
// Stage D item 1): this older step's address goes there with what it carried.
export default function InversionStep3Plan() {
  const location = useLocation();
  return <Navigate to={`/pre-mortem${location.search}${location.hash}`} replace state={location.state} />;
}
