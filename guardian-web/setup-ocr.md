# OCR Integration Setup Guide

Complete setup guide for AWS Textract OCR integration

## ✅ Current Status (July 20, 2025)

- ✅ **Edge Function Deployed**: OCR processor deployed to remote Supabase
- ✅ **Database Migration Applied**: All OCR fields added to documents table  
- ✅ **AWS Credentials Configured**: Textract access keys in Supabase secrets
- 🚀 **Ready for Testing**: Complete end-to-end OCR pipeline ready

## 🎯 Quick Test (You Are Here)

**Ready to test the OCR integration:**

1. **Open your Guardian web application**
2. **Sign in** with magic link authentication  
3. **Upload a medical document** (PDF, PNG, JPG)
4. **Monitor the processing**:
   - Status: `uploaded` → `processing` → `completed`
   - Check `extracted_text` field for document content
   - Verify `ocr_confidence` score (target >80%)

## 📋 Setup Details (Already Completed)

### Database Schema ✅
Your documents table now includes:
```sql
-- OCR fields (already applied)
extracted_text TEXT                  -- OCR extracted text
ocr_confidence DECIMAL(5,2)         -- Confidence score (0-100)
processed_at TIMESTAMPTZ            -- Processing completion time
error_log TEXT                      -- Error details for failed processing
status CHECK ('uploaded', 'processing', 'completed', 'failed')
```

## Step 2: AWS Credentials Setup

### Option A: AWS IAM User (Recommended for Development)

1. Create an IAM user in AWS Console
2. **SECURITY CRITICAL**: Create a custom minimal policy (see below)
3. Create access keys for the user

**⚠️ SECURITY WARNING**: Never use `AmazonTextractFullAccess` - this violates the principle of least privilege and is a critical security risk for healthcare applications.

**Custom IAM Policy (Minimal Permissions)**:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "textract:DetectDocumentText"
      ],
      "Resource": "*"
    }
  ]
}
```

**Steps to create the policy**:
1. Go to AWS Console → IAM → Policies → Create Policy
2. Select JSON tab and paste the policy above
3. Name it `TextractOCRMinimal`
4. Attach this policy to your IAM user

### Option B: AWS IAM Role (Recommended for Production)

1. Create an IAM role with Textract permissions
2. Configure role-based access for your deployment environment

## Step 3: Environment Variables

Add these environment variables to your Supabase Edge Function secrets:

```bash
# In Supabase Dashboard → Project → Edge Functions → Secrets
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
AWS_REGION=us-east-1
```

Or using Supabase CLI:
```bash
supabase secrets set AWS_ACCESS_KEY_ID=your_access_key_here
supabase secrets set AWS_SECRET_ACCESS_KEY=your_secret_key_here
supabase secrets set AWS_REGION=us-east-1
```

## Step 4: Deploy Edge Function

Deploy the updated document processor:

```bash
cd guardian-web
supabase functions deploy document-processor
```

## Step 5: Test OCR Integration

1. Upload a test medical document through your app
2. Check the Edge Function logs for processing status
3. Verify the `extracted_text` field is populated in the database

## Monitoring & Debugging

### Check Edge Function Logs
```bash
supabase functions logs document-processor
```

### Verify Database Updates
```sql
SELECT id, original_name, status, ocr_confidence, 
       LENGTH(extracted_text) as text_length, processed_at 
FROM documents 
WHERE processed_at IS NOT NULL 
ORDER BY processed_at DESC;
```

### AWS Textract Pricing

- **Free Tier**: 1,000 pages/month for 3 months
- **Basic Text Detection**: $0.0015 per page (async) / $0.01 per page (sync)
- **Monitor usage** in AWS Console → Textract → Usage

## Troubleshooting

### Common Issues

1. **Authentication Error**: Verify AWS credentials are correct
2. **Permission Denied**: Check IAM user has Textract permissions
3. **File Download Error**: Verify Supabase Storage permissions
4. **Database Error**: Ensure migration was applied correctly

### Debug Commands

```bash
# Test AWS credentials
aws textract help  # (if AWS CLI installed)

# Check Supabase connection
supabase status

# Verify Edge Function deployment
supabase functions list
```

## Success Criteria

✅ Documents upload successfully  
✅ Status changes from 'uploaded' → 'processing' → 'completed'  
✅ `extracted_text` field contains document text  
✅ `ocr_confidence` score is reasonable (>80%)  
✅ No errors in Edge Function logs