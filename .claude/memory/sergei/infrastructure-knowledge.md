# Sergei's Infrastructure Knowledge Bank

## Database Optimizations

### Guardian-Specific Patterns
- Multi-profile RLS policies require careful indexing on user_id and profile_id
- Healthcare document processing benefits from partitioning by date and user
- Clinical events table performs best with composite indexes on (user_id, timestamp, event_type)

### Performance Insights
- Supabase Edge Functions cold starts can be reduced with connection pooling
- Document processing workloads benefit from dedicated database connections
- Real-time subscriptions should be limited for healthcare data to prevent overwhelming clients

## Deployment Strategies

### Render.com Patterns
- Healthcare applications require zero-downtime deployments due to critical nature
- Environment variable updates should be staged to avoid PHI exposure
- Database migrations need careful coordination with application deployments

### Security Configurations
- HIPAA compliance requires TLS 1.2+ for all connections
- Audit logging must capture all data access with user context
- PHI data encryption at rest and in transit is mandatory

## Recent Problem Solutions
*This section will be updated as Sergei encounters and solves infrastructure issues*