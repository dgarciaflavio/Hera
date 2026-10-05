const estiloCSS = `
    <style>
        /* --- ESTILOS GLOBAIS --- */
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            margin: 0;
            background: #e0e5ec;
            color: #333;
        }
        .container {
            max-width: 1100px;
            margin: 30px auto;
            padding: 0 20px;
        }

        /* --- NAVBAR AGRUPADA --- */
        .navbar {
            background: linear-gradient(135deg, #0b0314, #2a0a38);
            padding: 0 20px;
            display: flex;
            align-items: center;
            box-shadow: 0 4px 15px rgba(0,0,0,0.4);
            border-bottom: 1px solid rgba(255,255,255,0.05);
        }
        .nav-brand {
            font-size: 1.4rem;
            font-weight: bold;
            color: #fff;
            padding: 15px 20px 15px 0;
            margin-right: 20px;
            letter-spacing: 1px;
            text-shadow: 0 0 10px rgba(255,255,255,0.3);
        }
        .dropdown {
            position: relative;
            display: inline-block;
        }
        .dropbtn {
            background: none;
            border: none;
            color: rgba(255,255,255,0.85);
            padding: 18px 20px;
            font-size: 15px;
            cursor: pointer;
            transition: all 0.3s ease;
            font-weight: bold;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .dropdown:hover .dropbtn {
            color: #ffffff;
            background: rgba(255,255,255,0.1);
            text-shadow: 0 0 8px rgba(255,255,255,0.4);
        }
        .dropdown-content {
            display: block;
            position: absolute;
            background: rgba(20, 10, 35, 0.95);
            backdrop-filter: blur(15px);
            min-width: 220px;
            box-shadow: 0px 10px 30px 0px rgba(0,0,0,0.6);
            z-index: 1000;
            opacity: 0;
            visibility: hidden;
            transform: translateY(15px);
            transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
            border-radius: 0 0 12px 12px;
            border: 1px solid rgba(255,255,255,0.08);
            border-top: none;
            overflow: hidden;
        }
        .dropdown:hover .dropdown-content {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        .dropdown-content a {
            color: rgba(255,255,255,0.8);
            padding: 14px 20px;
            text-decoration: none;
            display: block;
            transition: 0.2s;
            font-size: 14px;
            border-bottom: 1px solid rgba(255,255,255,0.03);
        }
        .dropdown-content a:hover {
            background-color: rgba(255,255,255,0.1);
            padding-left: 25px;
            color: #fff;
            border-left: 3px solid #9b59b6;
        }

        /* --- ANIMAÇÕES COMPARTILHADAS --- */
        @keyframes slideUpFadeIn { 
            to { opacity: 1; transform: translateY(0); } 
        }
        @keyframes bounce { 
            0%, 80%, 100% { transform: scale(0); } 
            40% { transform: scale(1.2); } 
        }

        /* --- ESTILOS GLOBAIS DE UI MELHORADOS --- */
        .card {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            padding: 25px;
            border-radius: 12px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05);
            margin-bottom: 20px;
            border: 1px solid rgba(255,255,255,0.4);
        }
        
        table {
            width: 100%;
            border-collapse: separate;
            border-spacing: 0;
            margin-top: 15px;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 8px rgba(0,0,0,0.05);
        }
        th, td {
            padding: 14px;
            text-align: left;
            border-bottom: 1px solid #eee;
            vertical-align: middle;
        }
        th {
            background-color: #f1f3f6;
            font-weight: bold;
            color: #2c3e50;
        }
        tr:hover td {
            background-color: #f8f9fc;
        }
        
        .btn {
            padding: 10px 18px;
            cursor: pointer;
            background: linear-gradient(135deg, #3498db, #2980b9);
            color: white;
            border: none;
            border-radius: 8px;
            font-weight: bold;
            transition: all 0.3s ease;
            box-shadow: 0 4px 10px rgba(52, 152, 219, 0.3);
        }
        .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 6px 15px rgba(52, 152, 219, 0.4);
        }
        .btn:disabled {
            background: #95a5a6;
            cursor: not-allowed;
            box-shadow: none;
            transform: none;
        }
        
        .btn-danger {
            background: linear-gradient(135deg, #e74c3c, #c0392b);
            box-shadow: 0 4px 10px rgba(231, 76, 60, 0.3);
        }
        .btn-danger:hover {
            box-shadow: 0 6px 15px rgba(231, 76, 60, 0.4);
        }
        
        .btn-warning {
            background: linear-gradient(135deg, #f1c40f, #f39c12);
            box-shadow: 0 4px 10px rgba(241, 196, 15, 0.3);
            color: #fff;
        }
        .btn-warning:hover {
            box-shadow: 0 6px 15px rgba(241, 196, 15, 0.4);
        }
        
        .input-text {
            padding: 10px;
            font-size: 15px;
            border-radius: 8px;
            border: 1px solid #cfd9e0;
            width: 200px;
            transition: border-color 0.3s;
        }
        .input-text:focus {
            outline: none;
            border-color: #3498db;
            box-shadow: 0 0 5px rgba(52,152,219,0.3);
        }
        .input-largo {
            width: 100%;
            max-width: 600px;
        }
        
        .tag {
            display: inline-block;
            padding: 5px 10px;
            border-radius: 999px;
            background: #ecf0f1;
            font-size: 12px;
            font-weight: bold;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        }
        .tag-ok {
            background: #d4efdf;
            color: #1e8449;
        }
    </style>
`;

module.exports = { estiloCSS };