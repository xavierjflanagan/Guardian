#!/bin/bash
# ========================================
# Guardian Vercel Deployment Setup Script
# ========================================
# This script helps set up Vercel deployment for Guardian Healthcare Platform
# Run from the repository root: ./scripts/deploy-setup.sh

set -e  # Exit on any error

echo "🚀 Guardian Vercel Deployment Setup"
echo "====================================="

# Check if we're in the right directory
if [ ! -f "pnpm-workspace.yaml" ]; then
    echo "❌ Error: Please run this script from the repository root"
    exit 1
fi

# Check if PNPM is installed
if ! command -v pnpm &> /dev/null; then
    echo "❌ Error: PNPM is not installed. Please install it first:"
    echo "   npm install -g pnpm"
    exit 1
fi

echo "✅ Repository structure validated"

# Install Vercel CLI if not already installed
if ! command -v vercel &> /dev/null; then
    echo "📦 Installing Vercel CLI..."
    pnpm add -g vercel
    echo "✅ Vercel CLI installed"
else
    echo "✅ Vercel CLI already installed"
fi

# Check if user is logged in to Vercel
echo "🔐 Checking Vercel authentication..."
if ! vercel whoami &> /dev/null; then
    echo "🔑 Please log in to Vercel:"
    vercel login
else
    echo "✅ Already logged in to Vercel as: $(vercel whoami)"
fi

# Test build locally first
echo "🏗️  Testing local build..."
if pnpm --filter @guardian/web run build; then
    echo "✅ Local build successful"
else
    echo "❌ Local build failed. Please fix build issues before deploying."
    exit 1
fi

# Link to Vercel project
echo "🔗 Linking to Vercel project..."
echo "When prompted:"
echo "  - Set up and deploy: Y"
echo "  - Which scope: Choose your account/team"
echo "  - Link to existing project: Y (if you have one) or N (to create new)"
echo "  - Project name: guardian-healthcare (or your preferred name)"
echo ""
read -p "Press Enter to continue with Vercel linking..."

vercel link

# Check if .vercel directory was created
if [ -d ".vercel" ]; then
    echo "✅ Project linked successfully"
else
    echo "❌ Project linking may have failed"
    exit 1
fi

# Set up environment variables
echo "🔧 Environment Variables Setup"
echo "==============================="
echo "You need to set up the following environment variables in Vercel Dashboard:"
echo ""
echo "🔥 REQUIRED (Core Supabase):"
echo "   NEXT_PUBLIC_SUPABASE_URL"
echo "   NEXT_PUBLIC_SUPABASE_ANON_KEY" 
echo "   SUPABASE_SERVICE_ROLE_KEY"
echo ""
echo "🔥 REQUIRED (AI Processing):"
echo "   OPENAI_API_KEY"
echo "   GOOGLE_CLOUD_API_KEY"
echo ""
echo "📝 Optional:"
echo "   AWS_ACCESS_KEY_ID (if using Textract)"
echo "   AWS_SECRET_ACCESS_KEY (if using Textract)"
echo "   AWS_REGION (if using Textract)"
echo ""
echo "💡 Go to your Vercel Dashboard → Project → Settings → Environment Variables"
echo "   Add these for both 'Production' and 'Preview' environments"

# Validate vercel.json configuration
echo "🔍 Validating vercel.json configuration..."
if [ -f "vercel.json" ]; then
    echo "✅ vercel.json found"
    
    # Check key configuration values
    if grep -q '"rootDirectory": "apps/web"' vercel.json; then
        echo "✅ Root directory configured correctly"
    else
        echo "⚠️  Warning: Root directory may not be configured correctly"
    fi
    
    if grep -q '"buildCommand": "pnpm --filter @guardian/web run build"' vercel.json; then
        echo "✅ Build command configured correctly"
    else
        echo "⚠️  Warning: Build command may not be configured correctly"
    fi
else
    echo "❌ vercel.json not found. This should exist in the repository root."
    exit 1
fi

# Test deployment (preview)
echo "🚀 Ready for deployment!"
echo "======================="
echo ""
echo "Next steps:"
echo "1. 🔧 Set up environment variables in Vercel Dashboard"
echo "2. 🧪 Test preview deployment: vercel"
echo "3. 🌟 Deploy to production: vercel --prod"
echo ""
echo "📋 Deployment checklist:"
echo "   □ Environment variables set in Vercel Dashboard"
echo "   □ Supabase project is accessible from Vercel domains"
echo "   □ AI API keys have sufficient credits/quota"
echo "   □ Custom domain configured (if applicable)"
echo ""

read -p "Would you like to test a preview deployment now? (y/N): " deploy_preview
if [[ $deploy_preview =~ ^[Yy]$ ]]; then
    echo "🧪 Creating preview deployment..."
    if vercel; then
        echo "✅ Preview deployment successful!"
        echo "🔗 Check the provided URL to test your application"
    else
        echo "❌ Preview deployment failed. Check the error messages above."
        echo "💡 Common issues:"
        echo "   - Missing environment variables"
        echo "   - Build errors (run 'pnpm --filter @guardian/web run build' locally)"
        echo "   - Network connectivity to Supabase"
    fi
else
    echo "⏭️  Skipping preview deployment"
fi

echo ""
echo "🎉 Vercel deployment setup complete!"
echo "📚 For more details, see: shared/docs/architecture/frontend/implementation/vercel-deployment-setup.md"