Feature: Points Expiration
  As a loyalty program member
  I want to know when my points expire
  So that I can use them before losing them

  Scenario: Points expire after 24 months of inactivity
    Given a loyalty member has 5000 points
      And the last earning activity was 24 months ago
     When the system runs the monthly expiration job
     Then the system expires the 5000 points
      And the member receives an expiration notification email

  Scenario: Any earning activity resets expiration clock
    Given a loyalty member has 5000 points
      And the last earning activity was 23 months ago
     When the member earns 100 points from a stay
     Then the expiration clock resets to 24 months from today
      And the system sends a points balance update
