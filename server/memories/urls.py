from django.urls import path
from . import views

urlpatterns = [
    path('add/', views.add_memory, name='add_memory'),
    path('add-with-graphiti/', views.add_memory_with_graphiti, name='add_memory_with_graphiti'),
    path('retrieve/', views.retrieve_memories, name='retrieve_memories'),
    path('list/', views.list_memories, name='list_memories'),
    path('<str:memory_id>/', views.memory_detail, name='memory_detail'),
    path("process-memory/", views.process_memory,name='process-memory'), 
]