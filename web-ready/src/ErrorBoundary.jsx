import React from "react";
export default class ErrorBoundary extends React.Component {
  constructor(p){ super(p); this.state={error:null}; }
  static getDerivedStateFromError(error){ return {error}; }
  componentDidCatch(err,info){ console.error("ErrorBoundary",err,info); }
  render(){
    if(this.state.error){
      return (
        <div style={{padding:16}}>
          <h2>Something went wrong</h2>
          <pre style={{whiteSpace:"pre-wrap"}}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}
