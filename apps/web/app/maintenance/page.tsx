export default function MaintenancePage() {
  return (
    <html lang="en">
      <head>
        <title>Guardian - Under Maintenance</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{__html: `
          body { 
            margin: 0; 
            font-family: system-ui, -apple-system, sans-serif; 
            background: #f9fafb; 
            min-height: 100vh; 
            display: flex; 
            align-items: center; 
            justify-content: center; 
          }
          .container { 
            text-align: center; 
            max-width: 400px; 
            padding: 2rem; 
            background: white; 
            border-radius: 8px; 
            box-shadow: 0 4px 6px rgba(0,0,0,0.1); 
          }
          .icon { 
            font-size: 3rem; 
            margin-bottom: 1rem; 
          }
          h1 { 
            color: #1f2937; 
            margin-bottom: 0.5rem; 
          }
          p { 
            color: #6b7280; 
            margin-bottom: 1rem; 
          }
          .status { 
            background: #fef3c7; 
            padding: 1rem; 
            border-radius: 6px; 
            margin: 1rem 0; 
          }
        `}} />
      </head>
      <body>
        <div className="container">
          <div className="icon" style={{fontSize: '2rem', color: '#f59e0b'}}>⚠</div>
          <h1>Under Maintenance</h1>
          <p>Guardian is currently undergoing scheduled maintenance to enhance security and performance.</p>
          
          <div className="status">
            <strong>System Update in Progress</strong><br />
            We will be back online shortly.
          </div>
          
          <p style={{fontSize: '0.875rem', color: '#9ca3af'}}>
            • All patient data remains secure<br />
            • No data will be lost<br />
            • Enhanced features coming soon
          </p>
        </div>
      </body>
    </html>
  );
}